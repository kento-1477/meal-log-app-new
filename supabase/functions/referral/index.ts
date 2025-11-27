import { DateTime } from 'luxon';
import { z } from 'zod';
import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { getAuthSession, requireAuth } from '../_shared/auth.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';

const app = createApp().basePath('/referral');

const INVITE_CODE_LENGTH = 6;
const FRIEND_PREMIUM_DAYS = 14;
const REFERRER_PREMIUM_DAYS = 30;
const CONSECUTIVE_DAYS_REQUIRED = 3;
const REFERRAL_EXPIRY_DAYS = 30;
const REFERRAL_RATE_LIMIT = 10;
const REFERRAL_RATE_WINDOW_HOURS = 1;

const ClaimRequestSchema = z.object({ code: z.string().min(1) });

app.get('/health', (c) => c.json({ ok: true, service: 'referral' }));

// Basic request logging for debugging
app.use('*', async (c, next) => {
  console.log('[referral] request', { method: c.req.method, url: c.req.url });
  await next();
  console.log('[referral] response', { method: c.req.method, url: c.req.url, status: c.res.status });
});

app.post('/api/referral/invite-link', requireAuth, async (c) => {
  const user = c.get('user');
  const link = await getOrCreateInviteLink(user.id);
  return c.json({ ok: true, ...link });
});

app.get('/api/referral/my-status', requireAuth, async (c) => {
  const user = c.get('user');
  const inviteLink = await getOrCreateInviteLink(user.id);
  const stats = await getReferralStats(user.id);
  const recentReferrals = await getRecentReferrals(user.id, 5);
  return c.json({
    ok: true,
    inviteCode: inviteLink.code,
    inviteLink: inviteLink.inviteLink,
    webLink: inviteLink.webLink,
    stats,
    recentReferrals,
  });
});

app.post('/api/referral/claim', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ClaimRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError('無効なリクエストです', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  const deviceFingerprint = await generateDeviceFingerprint({
    deviceId: c.req.header('x-device-id') ?? undefined,
    ip: extractClientIp(c),
    userAgent: c.req.header('user-agent') ?? '',
  });

  const result = await claimReferralCode({
    userId: user.id,
    code: parsed.data.code.trim(),
    deviceFingerprint,
  });

  return c.json({ ok: true, ...result });
});

export default app;

async function getOrCreateInviteLink(userId: number) {
  const { data: existing, error: findError } = await supabaseAdmin
    .from('ReferralInviteLink')
    .select('id, code')
    .eq('userId', userId)
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.error('referral: find invite link failed', findError);
    throw new HttpError('招待リンクの取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  let link = existing;
  if (!link) {
    let code: string | null = null;
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i += 1) {
      const candidate = generateInviteCode();
      const { data: collision } = await supabaseAdmin
        .from('ReferralInviteLink')
        .select('id')
        .eq('code', candidate)
        .limit(1)
        .maybeSingle();
      if (!collision) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new HttpError('招待コードの生成に失敗しました。しばらく時間をおいて再試行してください。', {
        status: HTTP_STATUS.INTERNAL_ERROR,
      });
    }

    const nowIso = new Date().toISOString();
    const { data: created, error: createError } = await supabaseAdmin
      .from('ReferralInviteLink')
      .insert({ userId, code, createdAt: nowIso, lastUsedAt: null })
      .select('id, code')
      .single();

    if (createError || !created) {
      console.error('referral: create invite link failed', createError);
      throw new HttpError('招待リンクの生成に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    link = created;
  }

  const deepLink = `meallog://invite?code=${link.code}`;
  const webLink = `https://meal-log.app/invite?code=${link.code}`;
  return {
    inviteLink: deepLink,
    webLink,
    code: link.code,
    message: '友だち1人で30日延長',
  };
}

async function claimReferralCode(params: { userId: number; code: string; deviceFingerprint: string }) {
  const { data: inviteLink, error: inviteError } = await supabaseAdmin
    .from('ReferralInviteLink')
    .select('id, userId, code, signupCount, user:User(id, username)')
    .eq('code', params.code)
    .maybeSingle();

  if (inviteError) {
    console.error('referral claim: fetch invite failed', inviteError);
    throw new HttpError('招待コードの取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!inviteLink) {
    throw new HttpError('招待コードが見つかりません', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  if (inviteLink.userId === params.userId) {
    throw new HttpError('自分自身を紹介することはできません', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  const { data: existingReferral, error: existingError } = await supabaseAdmin
    .from('Referral')
    .select('id')
    .eq('referredUserId', params.userId)
    .maybeSingle();

  if (existingError) {
    console.error('referral claim: fetch existing failed', existingError);
    throw new HttpError('紹介情報の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (existingReferral) {
    throw new HttpError('既に招待コードを使用済みです', { status: HTTP_STATUS.CONFLICT, expose: true });
  }

  const { count: suspiciousCount, error: suspiciousError } = await supabaseAdmin
    .from('Referral')
    .select('id', { count: 'exact', head: true })
    .eq('referrerUserId', inviteLink.userId)
    .eq('deviceFingerprint', params.deviceFingerprint);

  if (suspiciousError) {
    console.error('referral claim: suspicious check failed', suspiciousError);
    throw new HttpError('紹介コードの検証に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if ((suspiciousCount ?? 0) > 0) {
    throw new HttpError('不正な紹介として検出されました', { status: HTTP_STATUS.FORBIDDEN, expose: true });
  }

  const rateWindowStart = DateTime.now().minus({ hours: REFERRAL_RATE_WINDOW_HOURS }).toISO();
  const { count: recentReferrals, error: rateError } = await supabaseAdmin
    .from('Referral')
    .select('id', { count: 'exact', head: true })
    .eq('referrerUserId', inviteLink.userId)
    .gte('createdAt', rateWindowStart);

  if (rateError) {
    console.error('referral claim: rate check failed', rateError);
    throw new HttpError('紹介コードの検証に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if ((recentReferrals ?? 0) >= REFERRAL_RATE_LIMIT) {
    throw new HttpError('紹介リクエストが多すぎます。しばらく待ってから再度お試しください', {
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      expose: true,
    });
  }

  const now = new Date();
  const friendEndDate = DateTime.fromJSDate(now).plus({ days: FRIEND_PREMIUM_DAYS }).toJSDate();

  const { data: txResult, error: txError } = await supabaseAdmin.rpc('referral_claim', {
    p_referrer_user_id: inviteLink.userId,
    p_referred_user_id: params.userId,
    p_device_fingerprint: params.deviceFingerprint,
    p_friend_premium_days: FRIEND_PREMIUM_DAYS,
    p_friend_end_date: friendEndDate.toISOString(),
    p_rate_window_start: rateWindowStart ?? now.toISOString(),
  });

  // rpc may not exist; fall back to manual transaction via multi-step inserts
  if (txError || !txResult) {
    const { data: referral, error: referralError } = await supabaseAdmin
      .from('Referral')
      .insert({
        referrerUserId: inviteLink.userId,
        referredUserId: params.userId,
        status: 'PENDING',
        friendPremiumGranted: true,
        referrerPremiumGranted: false,
        consecutiveDaysAchieved: 0,
        deviceFingerprint: params.deviceFingerprint,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .select('id')
      .single();

    if (referralError || !referral) {
      console.error('referral claim: create referral failed', referralError);
      throw new HttpError('紹介コードの登録に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }

    const { error: updateInviteError } = await supabaseAdmin
      .from('ReferralInviteLink')
      .update({
        signupCount: (inviteLink.signupCount ?? 0) + 1,
        lastUsedAt: now.toISOString(),
      })
      .eq('id', inviteLink.id);
    if (updateInviteError) {
      console.error('referral claim: update invite link failed', updateInviteError);
    }

    const { error: grantError } = await supabaseAdmin.from('PremiumGrant').insert({
      userId: params.userId,
      source: 'REFERRAL_FRIEND',
      days: FRIEND_PREMIUM_DAYS,
      startDate: now.toISOString(),
      endDate: friendEndDate.toISOString(),
      referralId: referral.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    if (grantError) {
      console.error('referral claim: grant insert failed', grantError);
      throw new HttpError('紹介特典の付与に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
  }

  return {
    success: true,
    premiumDays: FRIEND_PREMIUM_DAYS,
    premiumUntil: friendEndDate.toISOString(),
    referrerUsername: inviteLink.user?.username ?? null,
  };
}

async function getReferralStats(userId: number) {
  const { data: referrals, error: referralError } = await supabaseAdmin
    .from('Referral')
    .select('status')
    .eq('referrerUserId', userId);

  if (referralError) {
    console.error('referral stats: fetch referrals failed', referralError);
    throw new HttpError('紹介状況の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const totalReferred = referrals?.length ?? 0;
  const completedReferred = referrals?.filter((r) => r.status === 'COMPLETED').length ?? 0;
  const pendingReferred = referrals?.filter((r) => r.status === 'PENDING').length ?? 0;

  const { data: premiumGrants, error: grantsError } = await supabaseAdmin
    .from('PremiumGrant')
    .select('days')
    .eq('userId', userId)
    .eq('source', 'REFERRAL_REFERRER');

  if (grantsError) {
    console.error('referral stats: fetch grants failed', grantsError);
    throw new HttpError('紹介状況の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const totalPremiumDaysEarned = (premiumGrants ?? []).reduce((sum, g) => sum + (g.days ?? 0), 0);

  return {
    totalReferred,
    completedReferred,
    pendingReferred,
    totalPremiumDaysEarned,
  };
}

async function getRecentReferrals(userId: number, limit = 5) {
  const { data: referrals, error } = await supabaseAdmin
    .from('Referral')
    .select(
      `
      referredUserId,
      status,
      consecutiveDaysAchieved,
      createdAt,
      completedAt,
      referredUser:User!Referral_referredUserId_fkey(username)
    `,
    )
    .eq('referrerUserId', userId)
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('referral recent: fetch failed', error);
    throw new HttpError('紹介履歴の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return (referrals ?? []).map((r) => ({
    friendUsername: (r as any).referredUser?.username ?? `User_${r.referredUserId}`,
    status: r.status,
    consecutiveDays: r.consecutiveDaysAchieved ?? 0,
    createdAt: r.createdAt,
    completedAt: r.completedAt ?? null,
  }));
}

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function generateDeviceFingerprint(params: { ip: string; userAgent: string; deviceId?: string }) {
  const normalizedDeviceId = params.deviceId && params.deviceId.trim().length > 0 ? params.deviceId.trim() : 'device:unknown';
  const raw = `${normalizedDeviceId}|${params.ip}|${params.userAgent}`;
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractClientIp(c: Parameters<typeof app.post>[1]['2']) {
  const xff = c.req.header('x-forwarded-for') ?? '';
  if (xff) {
    return xff.split(',')[0]?.trim() || '0.0.0.0';
  }
  return c.req.header('x-real-ip') ?? '0.0.0.0';
}
