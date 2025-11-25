import { DateTime } from 'luxon';
import type { UserTier, AiUsageSummary } from '@shared/index.js';
import { supabaseAdmin } from './supabase.ts';
import { HttpError, HTTP_STATUS } from './http.ts';

const DAILY_LIMITS: Record<UserTier, number> = {
  FREE: 3,
  PREMIUM: 20,
};

const USAGE_TIMEZONE = 'Asia/Tokyo';

export interface AiUsageStatus {
  allowed: boolean;
  plan: UserTier;
  limit: number;
  used: number;
  remaining: number;
  credits: number;
  consumeCredit: boolean;
  usageDate: Date;
}

function startOfUsageDay(now: Date = new Date()) {
  return DateTime.fromJSDate(now).setZone(USAGE_TIMEZONE).startOf('day');
}

function resolveTierOverride(): UserTier | null {
  const value = Deno.env.get('USER_TIER_OVERRIDE');
  return value === 'FREE' || value === 'PREMIUM' ? value : null;
}

export async function isPremium(userId: number): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('PremiumGrant')
    .select('id')
    .eq('userId', userId)
    .lte('startDate', nowIso)
    .gte('endDate', nowIso)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('isPremium query failed', error);
    throw new HttpError('プレミアム状態を確認できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return Boolean(data);
}

export async function evaluateAiUsage(userId: number): Promise<AiUsageStatus> {
  const { data: userRow, error: userError } = await supabaseAdmin
    .from('User')
    .select('aiCredits')
    .eq('id', userId)
    .maybeSingle();

  if (userError) {
    console.error('evaluateAiUsage: failed to fetch user row', userError);
    throw new HttpError('AI 利用状況を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!userRow) {
    throw new HttpError('AI 利用状況の確認対象ユーザーが見つかりませんでした', {
      status: HTTP_STATUS.NOT_FOUND,
      expose: true,
    });
  }

  const usageDay = startOfUsageDay();
  const usageDate = usageDay.toJSDate();
  const usageDateIso = usageDay.toISODate() ?? usageDate.toISOString();

  const premiumUser = await isPremium(userId);
  const tier: UserTier = resolveTierOverride() ?? (premiumUser ? 'PREMIUM' : 'FREE');
  const limit = DAILY_LIMITS[tier];
  const credits = userRow.aiCredits ?? 0;

  const { data: counterRow, error: counterError } = await supabaseAdmin
    .from('AiUsageCounter')
    .select('count')
    .eq('userId', userId)
    .eq('usageDate', usageDateIso)
    .maybeSingle();

  if (counterError) {
    console.error('evaluateAiUsage: failed to fetch usage counter', counterError);
    throw new HttpError('AI 利用状況を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const used = counterRow?.count ?? 0;
  const remaining = Math.max(limit - used, 0);
  const consumeCredit = remaining === 0 && credits > 0;
  const allowed = remaining > 0 || consumeCredit;

  return {
    allowed,
    plan: tier,
    limit,
    used,
    remaining,
    credits,
    consumeCredit,
    usageDate,
  };
}

export async function recordAiUsage(params: { userId: number; usageDate: Date; consumeCredit: boolean }): Promise<AiUsageSummary> {
  const usageDay = DateTime.fromJSDate(params.usageDate).setZone(USAGE_TIMEZONE).startOf('day');
  const usageDateIso = usageDay.toISODate() ?? params.usageDate.toISOString();
  const nowIso = new Date().toISOString();

  const { data: userRow, error: userError } = await supabaseAdmin
    .from('User')
    .select('aiCredits')
    .eq('id', params.userId)
    .maybeSingle();

  if (userError) {
    console.error('recordAiUsage: failed to fetch user', userError);
    throw new HttpError('AI 利用記録の対象ユーザーが見つかりませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!userRow) {
    throw new HttpError('AI 利用記録の対象ユーザーが見つかりませんでした', {
      status: HTTP_STATUS.NOT_FOUND,
      expose: true,
    });
  }

  const { data: counterRow, error: counterError } = await supabaseAdmin
    .from('AiUsageCounter')
    .select('count')
    .eq('userId', params.userId)
    .eq('usageDate', usageDateIso)
    .maybeSingle();

  if (counterError) {
    console.error('recordAiUsage: failed to fetch counter', counterError);
    throw new HttpError('AI 利用状況を更新できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  let used: number;
  if (counterRow) {
    const { data: updatedCounter, error: updateError } = await supabaseAdmin
      .from('AiUsageCounter')
      .update({ count: (counterRow.count ?? 0) + 1, lastUsedAt: nowIso })
      .eq('userId', params.userId)
      .eq('usageDate', usageDateIso)
      .select('count')
      .single();

    if (updateError) {
      console.error('recordAiUsage: failed to update counter', updateError);
      throw new HttpError('AI 利用状況を更新できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
    }

    used = updatedCounter?.count ?? (counterRow.count ?? 0) + 1;
  } else {
    const { data: insertedCounter, error: insertError } = await supabaseAdmin
      .from('AiUsageCounter')
      .insert({ userId: params.userId, usageDate: usageDateIso, count: 1 })
      .select('count')
      .single();

    if (insertError) {
      console.error('recordAiUsage: failed to insert counter', insertError);
      throw new HttpError('AI 利用状況を更新できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
    }

    used = insertedCounter?.count ?? 1;
  }

  let updatedCredits = userRow.aiCredits ?? 0;
  let consumedCredit = false;

  if (params.consumeCredit && updatedCredits > 0) {
    const { data: updatedUser, error: updateCreditsError } = await supabaseAdmin
      .from('User')
      .update({ aiCredits: updatedCredits - 1 })
      .eq('id', params.userId)
      .select('aiCredits')
      .single();

    if (updateCreditsError) {
      console.error('recordAiUsage: failed to decrement credits', updateCreditsError);
      throw new HttpError('AI クレジットの更新に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }

    updatedCredits = updatedUser?.aiCredits ?? updatedCredits - 1;
    consumedCredit = true;
  }

  const premiumUser = await isPremium(params.userId);
  const tier: UserTier = resolveTierOverride() ?? (premiumUser ? 'PREMIUM' : 'FREE');
  const limit = DAILY_LIMITS[tier];
  const remaining = Math.max(limit - used, 0);

  return {
    plan: tier,
    limit,
    used,
    remaining,
    credits: updatedCredits,
    consumedCredit,
    resetsAt: nextResetIso(usageDay),
  };
}

export function summarizeUsageStatus(status: AiUsageStatus, consumedCredit = false): AiUsageSummary {
  const usageDay = DateTime.fromJSDate(status.usageDate).setZone(USAGE_TIMEZONE).startOf('day');
  return {
    plan: status.plan,
    limit: status.limit,
    used: status.used,
    remaining: status.remaining,
    credits: status.credits,
    consumedCredit,
    resetsAt: nextResetIso(usageDay),
  };
}

export function buildUsageLimitError(status: AiUsageStatus) {
  return new HttpError('AI の利用上限に達しました', {
    status: HTTP_STATUS.TOO_MANY_REQUESTS,
    expose: true,
    code: 'AI_USAGE_LIMIT',
    data: {
      plan: status.plan,
      limit: status.limit,
      used: status.used,
      remaining: status.remaining,
      credits: status.credits,
      resetsAt: nextResetIso(DateTime.fromJSDate(status.usageDate).setZone(USAGE_TIMEZONE).startOf('day')),
    },
  });
}

function nextResetIso(day: DateTime) {
  return day.plus({ days: 1 }).toISO() ?? day.plus({ days: 1 }).toUTC().toISO() ?? new Date().toISOString();
}
