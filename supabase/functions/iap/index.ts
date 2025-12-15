import { DateTime } from 'luxon';
import {
  IapPurchaseRequestSchema,
  resolveCreditsForProduct,
  resolvePremiumDaysForProduct,
  type IapPurchaseRequest,
  type PremiumStatus,
} from '@shared/index.js';
import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { requireAuth } from '../_shared/auth.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';
import { evaluateAiUsage, summarizeUsageStatus } from '../_shared/ai.ts';
import { boolEnv, getEnv } from '../_shared/env.ts';

const app = createApp();

const APP_STORE_SHARED_SECRET = getEnv('APP_STORE_SHARED_SECRET', { optional: true });
const OFFLINE_VERIFICATION = boolEnv('IAP_OFFLINE_VERIFICATION', false);
const APP_STORE_VERIFY_TIMEOUT_MS = Number(Deno.env.get('APP_STORE_VERIFY_TIMEOUT_MS') ?? 15_000);

app.get('/health', (c) => c.json({ ok: true, service: 'iap' }));

app.use('*', async (c, next) => {
  console.log('[iap] request', { method: c.req.method, url: c.req.url });
  await next();
});

const PURCHASE_PATHS = ['/api/iap/purchase', '/iap/api/iap/purchase'] as const;

PURCHASE_PATHS.forEach((path) =>
  app.post(path, requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = IapPurchaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError('入力内容が正しくありません', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
  const request = parsed.data;

  if (request.platform !== 'APP_STORE') {
    throw new HttpError('Google Play の検証は後日対応予定です', {
      status: HTTP_STATUS.NOT_IMPLEMENTED,
      expose: true,
    });
  }

  console.log('iap purchase payload', {
    userId: user.id,
    productId: request.productId,
    transactionId: request.transactionId,
    environment: request.environment ?? null,
  });

  const existing = await findReceiptByTransaction(request.transactionId);
  if (existing) {
    if (existing.userId !== user.id) {
      throw new HttpError('別のユーザーで既に処理済みの購入です', {
        status: HTTP_STATUS.CONFLICT,
        expose: true,
      });
    }

    await ensurePremiumGrantFromReceipt(existing);

    const usage = summarizeUsageStatus(await evaluateAiUsage(user.id));
    const premiumStatus = await buildPremiumStatusPayload(user.id);
    return c.json({ ok: true, creditsGranted: 0, usage, premiumStatus });
  }

  const verification = await verifyAppStoreReceipt(request);

  if (verification.transactionId !== request.transactionId) {
    console.log('iap transactionId mismatch', {
      requestTransactionId: request.transactionId,
      verifiedTransactionId: verification.transactionId,
    });
  }

  const verifiedExisting = await findReceiptByTransaction(verification.transactionId);
  if (verifiedExisting) {
    if (verifiedExisting.userId !== user.id) {
      throw new HttpError('別のユーザーで既に処理済みの購入です', {
        status: HTTP_STATUS.CONFLICT,
        expose: true,
      });
    }

    await ensurePremiumGrantFromReceipt(verifiedExisting);

    const usage = summarizeUsageStatus(await evaluateAiUsage(user.id));
    const premiumStatus = await buildPremiumStatusPayload(user.id);
    return c.json({ ok: true, creditsGranted: 0, usage, premiumStatus });
  }

  const resolvedProductId = verification.productId ?? request.productId;
  const creditsPerUnit = resolveCreditsForProduct(resolvedProductId);
  const premiumDaysPerUnit = resolvePremiumDaysForProduct(resolvedProductId);

  if (creditsPerUnit === null && premiumDaysPerUnit === null) {
    throw new HttpError(`未対応のプロダクトIDです: ${resolvedProductId}`, {
      status: HTTP_STATUS.BAD_REQUEST,
      expose: true,
    });
  }

  const quantity = verification.quantity ?? request.quantity ?? 1;
  const creditsGranted = (creditsPerUnit ?? 0) * quantity;
  const premiumDaysGranted = (premiumDaysPerUnit ?? 0) * quantity;

  if (creditsGranted <= 0 && premiumDaysGranted <= 0) {
    throw new HttpError('付与内容が計算できませんでした', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  const purchasedAt = verification.purchaseDate ?? new Date();
  const purchasedAtIso = purchasedAt.toISOString();
  const endDate = DateTime.fromJSDate(purchasedAt).plus({ days: premiumDaysGranted }).toJSDate();

  const iapReceiptId = await insertReceipt({
    userId: user.id,
    productId: resolvedProductId,
    transactionId: verification.transactionId,
    environment: verification.environment,
    quantity,
    creditsGranted,
    purchasedAt,
    raw: verification.raw,
  });

  if (creditsGranted > 0) {
    await incrementCredits(user.id, creditsGranted);
  }

  if (premiumDaysGranted > 0) {
    await insertPremiumGrant({
      userId: user.id,
      days: premiumDaysGranted,
      startDate: purchasedAtIso,
      endDate: endDate.toISOString(),
      iapReceiptId,
    });
  }

  const usage = summarizeUsageStatus(await evaluateAiUsage(user.id));
  const premiumStatus = await buildPremiumStatusPayload(user.id);
  return c.json({ ok: true, creditsGranted, usage, premiumStatus });
}),
);

export default app;

async function findReceiptByTransaction(transactionId: string) {
  const { data, error } = await supabaseAdmin
    .from('IapReceipt')
    .select('id, userId, productId, purchasedAt')
    .eq('transactionId', transactionId)
    .maybeSingle();

  if (error) {
    console.error('iap: find receipt failed', error);
    throw new HttpError('購入情報の確認に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  return data;
}

async function ensurePremiumGrantFromReceipt(receipt: {
  id: number;
  userId: number;
  productId: string;
  purchasedAt: string;
}) {
  const premiumDays = resolvePremiumDaysForProduct(receipt.productId);
  if (premiumDays == null || premiumDays <= 0) {
    return;
  }

  const { data: existingGrant, error: grantError } = await supabaseAdmin
    .from('PremiumGrant')
    .select('id')
    .eq('userId', receipt.userId)
    .eq('iapReceiptId', receipt.id)
    .limit(1)
    .maybeSingle();

  if (grantError) {
    console.error('iap: find premium grant failed', grantError);
    throw new HttpError('プレミアム付与の確認に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (existingGrant) {
    return;
  }

  const startDate = receipt.purchasedAt;
  const endDate = DateTime.fromISO(startDate).plus({ days: premiumDays }).toISO();
  if (!endDate) {
    throw new HttpError('プレミアム期限の計算に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  await insertPremiumGrant({
    userId: receipt.userId,
    days: premiumDays,
    startDate,
    endDate,
    iapReceiptId: receipt.id,
  });
}

async function insertReceipt(params: {
  userId: number;
  productId: string;
  transactionId: string;
  environment: string;
  quantity: number;
  creditsGranted: number;
  purchasedAt: Date;
  raw: unknown;
}) {
  const { data, error } = await supabaseAdmin
    .from('IapReceipt')
    .insert({
      userId: params.userId,
      platform: 'APP_STORE',
      productId: params.productId,
      transactionId: params.transactionId,
      environment: params.environment,
      quantity: params.quantity,
      creditsGranted: params.creditsGranted,
      status: 'VERIFIED',
      purchasedAt: params.purchasedAt.toISOString(),
      payload: params.raw,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('iap: insert receipt failed', error);
    throw new HttpError('購入情報の保存に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  return data.id;
}

async function incrementCredits(userId: number, incrementBy: number) {
  const { data: userRow, error: fetchError } = await supabaseAdmin
    .from('User')
    .select('aiCredits')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError || !userRow) {
    console.error('iap: fetch user for credits failed', fetchError);
    throw new HttpError('クレジット付与に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const nextCredits = (userRow.aiCredits ?? 0) + incrementBy;
  const { error: updateError } = await supabaseAdmin.from('User').update({ aiCredits: nextCredits }).eq('id', userId);
  if (updateError) {
    console.error('iap: update credits failed', updateError);
    throw new HttpError('クレジット付与に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
}

async function insertPremiumGrant(params: {
  userId: number;
  days: number;
  startDate: string;
  endDate: string;
  iapReceiptId: number;
}) {
  const { error } = await supabaseAdmin.from('PremiumGrant').insert({
    userId: params.userId,
    source: 'PURCHASE',
    days: params.days,
    startDate: params.startDate,
    endDate: params.endDate,
    iapReceiptId: params.iapReceiptId,
    createdAt: params.startDate,
    updatedAt: params.startDate,
  });

  if (error) {
    console.error('iap: insert premium grant failed', error);
    throw new HttpError('プレミアム付与に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
}

async function buildPremiumStatusPayload(userId: number): Promise<PremiumStatus> {
  const nowIso = new Date().toISOString();

  const { data: active, error: activeError } = await supabaseAdmin
    .from('PremiumGrant')
    .select('source, endDate')
    .eq('userId', userId)
    .lte('startDate', nowIso)
    .gte('endDate', nowIso)
    .order('endDate', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    console.error('iap: fetch active grant failed', activeError);
    throw new HttpError('プレミアム状態の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const { data: grants, error: grantsError } = await supabaseAdmin
    .from('PremiumGrant')
    .select('source, days, startDate, endDate, createdAt')
    .eq('userId', userId)
    .order('createdAt', { ascending: false });

  if (grantsError) {
    console.error('iap: fetch grants failed', grantsError);
    throw new HttpError('プレミアム状態の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  let daysRemaining = 0;
  let expiresAt: string | null = null;
  let source: PremiumStatus['source'] = null;
  if (active) {
    source = active.source as PremiumStatus['source'];
    const remaining = DateTime.fromISO(active.endDate ?? nowIso).diff(DateTime.now(), 'days').days;
    daysRemaining = Math.max(Math.ceil(remaining), 0);
    expiresAt = active.endDate ?? null;
  }

  return {
    isPremium: Boolean(active),
    source,
    daysRemaining,
    expiresAt,
    grants: (grants ?? []).map((g) => ({
      source: g.source,
      days: g.days,
      startDate: g.startDate,
      endDate: g.endDate,
      createdAt: g.createdAt ?? undefined,
    })),
  };
}

async function verifyAppStoreReceipt(input: IapPurchaseRequest) {
  if (OFFLINE_VERIFICATION) {
    return verifyTestReceipt(input);
  }
  if (!APP_STORE_SHARED_SECRET) {
    throw new HttpError('App Store Shared Secret が設定されていません', {
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      expose: true,
    });
  }

  const body = JSON.stringify({
    'receipt-data': input.receiptData,
    password: APP_STORE_SHARED_SECRET,
    'exclude-old-transactions': true,
  });

  const endpoints =
    input.environment === 'sandbox'
      ? ['https://sandbox.itunes.apple.com/verifyReceipt', 'https://buy.itunes.apple.com/verifyReceipt']
      : ['https://buy.itunes.apple.com/verifyReceipt', 'https://sandbox.itunes.apple.com/verifyReceipt'];

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
        APP_STORE_VERIFY_TIMEOUT_MS,
      );
      if (!response.ok) {
        lastError = new Error(`App Store verifyReceipt HTTP ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as any;
      const status = Number(payload?.status ?? -1);
      if (status === 21007 || status === 21008) {
        continue;
      }
      if (status !== 0) {
        lastError = new Error(`App Store verification failed with status ${status}`);
        continue;
      }

      const receipts: any[] = Array.isArray(payload?.latest_receipt_info)
        ? payload.latest_receipt_info
        : Array.isArray(payload?.receipt?.in_app)
          ? payload.receipt.in_app
          : [];
      if (!receipts.length) {
        lastError = new Error('App Store レシートにトランザクションが存在しません');
        continue;
      }

      const matched = receipts.find((entry) => entry.transaction_id === input.transactionId) ?? receipts[0];
      if (!matched) {
        lastError = new Error('App Store レシートに一致するトランザクションが見つかりませんでした');
        continue;
      }

      const transactionId = matched.transaction_id ?? input.transactionId;
      const productId = matched.product_id ?? input.productId;
      const quantity = Number(matched.quantity ?? input.quantity ?? 1);
      const purchaseDateMs = Number(matched.purchase_date_ms ?? Date.now());
      const purchaseDate = Number.isFinite(purchaseDateMs) ? new Date(purchaseDateMs) : new Date();

      return {
        transactionId,
        productId,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        purchaseDate,
        environment: payload?.environment ?? (endpoint.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION'),
        raw: payload,
      };
    } catch (error) {
      lastError = error as Error;
    }
  }

  console.error('iap: app store verification failed', lastError);
  throw new HttpError('App Store レシートの検証に失敗しました', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  if (!timeoutMs || timeoutMs <= 0) {
    return fetch(url, init);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function verifyTestReceipt(input: IapPurchaseRequest) {
  try {
    const decoded = atob(input.receiptData);
    const payload = JSON.parse(decoded) as {
      transactionId?: string;
      productId?: string;
      quantity?: number;
      purchaseDate?: string;
      environment?: string;
    };

    const transactionId = payload.transactionId ?? input.transactionId;
    const productId = payload.productId ?? input.productId;
    const quantity = Number(payload.quantity ?? input.quantity ?? 1);
    const purchaseDate = payload.purchaseDate ? new Date(payload.purchaseDate) : new Date();
    if (Number.isNaN(purchaseDate.getTime())) {
      throw new Error('purchaseDate が無効です');
    }

    return {
      transactionId,
      productId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      purchaseDate,
      environment: payload.environment ?? 'TEST',
      raw: payload,
    };
  } catch (error) {
    console.error('iap: test receipt parse failed', error);
    throw new HttpError('テストレシートの検証に失敗しました', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
}
