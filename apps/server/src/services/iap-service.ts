import { StatusCodes } from 'http-status-codes';
import { IapPlatform } from '@prisma/client';
import type { AiUsageSummary, IapPurchaseRequest, PremiumStatus } from '@meal-log/shared';
import { resolveCreditsForProduct, resolvePremiumDaysForProduct } from '@meal-log/shared';
import { prisma } from '../db/prisma.js';
import { env } from '../env.js';
import { evaluateAiUsage, summarizeUsageStatus } from './ai-usage-service.js';
import { logger } from '../logger.js';
import { DateTime } from 'luxon';
import { getAllPremiumGrants, getPremiumStatus } from './premium-service.js';

interface ProcessPurchaseParams extends IapPurchaseRequest {
  userId: number;
}

interface ReceiptVerificationResult {
  transactionId: string;
  productId: string;
  originalTransactionId?: string | null;
  quantity: number;
  purchaseDate: Date;
  expiresDate?: Date | null;
  isTrial?: boolean;
  environment: string;
  raw: unknown;
}

const DEFAULT_QUANTITY = 1;

export async function processIapPurchase(params: ProcessPurchaseParams): Promise<{
  creditsGranted: number;
  usage: AiUsageSummary;
  premiumStatus: PremiumStatus;
}> {
  const platform = params.platform === 'APP_STORE' ? IapPlatform.APP_STORE : IapPlatform.GOOGLE_PLAY;

  const existing = await prisma.iapReceipt.findUnique({ where: { transactionId: params.transactionId } });
  if (existing) {
    if (existing.userId !== params.userId) {
      const error = new Error('別のユーザーで既に処理済みの購入です');
      Object.assign(error, { statusCode: StatusCodes.CONFLICT, expose: true });
      throw error;
    }
    const status = await evaluateAiUsage(params.userId);
    const premiumStatus = await buildPremiumStatusPayload(params.userId);
    return {
      creditsGranted: 0,
      usage: summarizeUsageStatus(status),
      premiumStatus,
    };
  }

  const verification = await verifyReceipt({
    platform,
    productId: params.productId,
    transactionId: params.transactionId,
    receiptData: params.receiptData,
    environment: params.environment,
    quantity: params.quantity,
  });

  const resolvedProductId = verification.productId ?? params.productId;
  const creditsPerUnit = resolveCreditsForProduct(resolvedProductId);
  const premiumDaysPerUnit = resolvePremiumDaysForProduct(resolvedProductId);

  if (creditsPerUnit === null && premiumDaysPerUnit === null) {
    const error = new Error(`未対応のプロダクトIDです: ${resolvedProductId}`);
    Object.assign(error, { statusCode: StatusCodes.BAD_REQUEST, expose: true });
    throw error;
  }

  const quantity = verification.quantity || DEFAULT_QUANTITY;
  const creditsGranted = (creditsPerUnit ?? 0) * quantity;
  const premiumGrant = resolvePremiumGrant(verification, premiumDaysPerUnit, quantity);
  const premiumDaysGranted = premiumGrant?.days ?? 0;
  const originalTransactionId =
    verification.originalTransactionId ?? (premiumDaysPerUnit ? verification.transactionId : null);

  if (creditsGranted <= 0 && premiumDaysGranted <= 0) {
    const error = new Error('付与内容が計算できませんでした');
    Object.assign(error, { statusCode: StatusCodes.BAD_REQUEST, expose: true });
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    const receipt = await tx.iapReceipt.create({
      data: {
        userId: params.userId,
        platform,
        productId: verification.productId,
        transactionId: verification.transactionId,
        originalTransactionId: originalTransactionId ?? undefined,
        environment: verification.environment,
        quantity: verification.quantity,
        creditsGranted,
        status: 'VERIFIED',
        purchasedAt: verification.purchaseDate,
        payload: verification.raw as any,
      },
    });

    if (creditsGranted > 0) {
      await tx.user.update({
        where: { id: params.userId },
        data: { aiCredits: { increment: creditsGranted } },
      });
    }

    if (premiumGrant) {
      await tx.premiumGrant.create({
        data: {
          userId: params.userId,
          source: 'PURCHASE',
          days: premiumGrant.days,
          startDate: premiumGrant.startDate,
          endDate: premiumGrant.endDate,
          iapReceiptId: receipt.id,
        },
      });
    }
  });

  logger.info({ userId: params.userId, creditsGranted, transactionId: params.transactionId }, 'iap purchase processed');

  const usageStatus = await evaluateAiUsage(params.userId);
  const premiumStatus = await buildPremiumStatusPayload(params.userId);
  return {
    creditsGranted,
    usage: summarizeUsageStatus(usageStatus),
    premiumStatus,
  };
}

async function buildPremiumStatusPayload(userId: number): Promise<PremiumStatus> {
  const status = await getPremiumStatus(userId);
  const grants = await getAllPremiumGrants(userId);

  return {
    isPremium: status.isPremium,
    source: status.source,
    daysRemaining: status.daysRemaining,
    expiresAt: status.expiresAt?.toISOString() ?? null,
    grants: grants.map((grant) => ({
      source: grant.source,
      days: grant.days,
      startDate: grant.startDate.toISOString(),
      endDate: grant.endDate.toISOString(),
      createdAt: grant.createdAt.toISOString(),
    })),
  };
}

interface VerifyReceiptInput {
  platform: IapPlatform;
  productId: string;
  transactionId: string;
  receiptData: string;
  environment?: 'sandbox' | 'production';
  quantity?: number;
}

async function verifyReceipt(input: VerifyReceiptInput): Promise<ReceiptVerificationResult> {
  if (env.IAP_OFFLINE_VERIFICATION) {
    if (env.NODE_ENV === 'production') {
      throw Object.assign(new Error('Offline IAP verification is not allowed in production'), {
        statusCode: StatusCodes.SERVICE_UNAVAILABLE,
        expose: true,
      });
    }
    return verifyTestReceipt(input);
  }

  switch (input.platform) {
    case IapPlatform.APP_STORE:
      return verifyAppStoreReceipt(input);
    case IapPlatform.GOOGLE_PLAY:
      throw Object.assign(new Error('Google Play の検証は未設定です'), {
        statusCode: StatusCodes.NOT_IMPLEMENTED,
        expose: true,
      });
    default:
      throw Object.assign(new Error('未対応のプラットフォームです'), {
        statusCode: StatusCodes.BAD_REQUEST,
        expose: true,
      });
  }
}

function verifyTestReceipt(input: VerifyReceiptInput): ReceiptVerificationResult {
  try {
    const decoded = Buffer.from(input.receiptData, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as {
      transactionId?: string;
      productId?: string;
      originalTransactionId?: string;
      original_transaction_id?: string;
      quantity?: number;
      purchaseDate?: string;
      expiresDate?: string;
      expiresDateMs?: number;
      isTrial?: boolean;
      environment?: string;
    };

    const transactionId = payload.transactionId ?? input.transactionId;
    if (transactionId !== input.transactionId) {
      throw new Error('transactionId が一致しません');
    }
    const productId = payload.productId ?? input.productId;
    if (productId !== input.productId) {
      throw new Error('productId が一致しません');
    }

    const quantity = Number(payload.quantity ?? input.quantity ?? DEFAULT_QUANTITY);
    const purchaseDate = payload.purchaseDate ? new Date(payload.purchaseDate) : new Date();
    const expiresDate = resolveExpiresDate(payload.expiresDate, payload.expiresDateMs);
    const originalTransactionId =
      payload.originalTransactionId ??
      payload.original_transaction_id ??
      input.transactionId;

    if (Number.isNaN(purchaseDate.getTime())) {
      throw new Error('purchaseDate が無効です');
    }

    return {
      transactionId,
      productId,
      originalTransactionId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : DEFAULT_QUANTITY,
      purchaseDate,
      expiresDate,
      isTrial: payload.isTrial ?? false,
      environment: payload.environment ?? 'TEST',
      raw: payload,
    };
  } catch (error) {
    const err = new Error('テストレシートの検証に失敗しました');
    Object.assign(err, { cause: error, statusCode: StatusCodes.BAD_REQUEST, expose: true });
    throw err;
  }
}

async function verifyAppStoreReceipt(input: VerifyReceiptInput): Promise<ReceiptVerificationResult> {
  if (!env.APP_STORE_SHARED_SECRET) {
    throw Object.assign(new Error('App Store Shared Secret が設定されていません'), {
      statusCode: StatusCodes.SERVICE_UNAVAILABLE,
      expose: true,
    });
  }

  const body = JSON.stringify({
    'receipt-data': input.receiptData,
    password: env.APP_STORE_SHARED_SECRET,
    'exclude-old-transactions': true,
  });

  const endpoints = input.environment === 'sandbox'
    ? ['https://sandbox.itunes.apple.com/verifyReceipt', 'https://buy.itunes.apple.com/verifyReceipt']
    : ['https://buy.itunes.apple.com/verifyReceipt', 'https://sandbox.itunes.apple.com/verifyReceipt'];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        lastError = new Error(`App Store verifyReceipt HTTP ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as any;
      const status = Number(payload?.status ?? -1);

      if (status === 21007 || status === 21008) {
        // retry against sandbox/production depending on suggested environment
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
      const originalTransactionId = matched.original_transaction_id ?? transactionId;
      const quantity = Number(matched.quantity ?? input.quantity ?? DEFAULT_QUANTITY);
      const purchaseDateMs = Number(matched.purchase_date_ms ?? Date.now());
      const purchaseDate = Number.isFinite(purchaseDateMs) ? new Date(purchaseDateMs) : new Date();
      const expiresDateMs = Number(matched.expires_date_ms ?? NaN);
      const expiresDate = Number.isFinite(expiresDateMs) ? new Date(expiresDateMs) : null;
      const isTrial = matched.is_trial_period === 'true' || matched.is_trial_period === true;

      return {
        transactionId,
        productId,
        originalTransactionId,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : DEFAULT_QUANTITY,
        purchaseDate,
        expiresDate,
        isTrial,
        environment: payload?.environment ?? (endpoint.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION'),
        raw: payload,
      };
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (lastError) {
    throw Object.assign(new Error('App Store レシートの検証に失敗しました'), {
      cause: lastError,
      statusCode: StatusCodes.BAD_REQUEST,
      expose: true,
    });
  }

  throw Object.assign(new Error('App Store レシートの検証に失敗しました'), {
    statusCode: StatusCodes.BAD_REQUEST,
    expose: true,
  });
}

function resolveExpiresDate(expiresDate?: string, expiresDateMs?: number) {
  if (typeof expiresDateMs === 'number' && Number.isFinite(expiresDateMs)) {
    return new Date(expiresDateMs);
  }
  if (typeof expiresDate === 'string') {
    const parsed = new Date(expiresDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function resolvePremiumGrant(
  verification: ReceiptVerificationResult,
  premiumDaysPerUnit: number | null,
  quantity: number,
) {
  if (!premiumDaysPerUnit) {
    return null;
  }

  const startDate = verification.purchaseDate;
  const expiresDate = verification.expiresDate;

  if (expiresDate && expiresDate.getTime() > startDate.getTime()) {
    const diffDays = DateTime.fromJSDate(expiresDate).diff(DateTime.fromJSDate(startDate), 'days').days;
    const days = Math.max(1, Math.ceil(diffDays));
    return { days, startDate, endDate: expiresDate };
  }

  const days = premiumDaysPerUnit * quantity;
  if (days <= 0) {
    return null;
  }

  const endDate = DateTime.fromJSDate(startDate).plus({ days }).toJSDate();
  return { days, startDate, endDate };
}
