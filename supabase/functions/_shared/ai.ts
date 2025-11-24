import { DateTime } from 'luxon';
import type { UserTier, AiUsageSummary } from '@shared/index.js';
import { sql, type TransactionSql } from './db.ts';
import { HttpError, HTTP_STATUS } from './http.ts';

const DAILY_LIMITS: Record<UserTier, number> = {
  FREE: 3,
  PREMIUM: 20,
};

const USAGE_TIMEZONE = 'Asia/Tokyo';

type SqlLike = typeof sql | TransactionSql<Record<string, unknown>>;

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

export async function isPremium(userId: number, client: SqlLike = sql): Promise<boolean> {
  const now = new Date();
  const active = await client`
    select 1
    from "PremiumGrant"
    where "userId" = ${userId}
      and "startDate" <= ${now}
      and "endDate" >= ${now}
    limit 1;
  `;
  return active.length > 0;
}

export async function evaluateAiUsage(userId: number): Promise<AiUsageStatus> {
  const userRows = await sql<{ aiCredits: number }[]>`
    select "aiCredits" from "User" where "id" = ${userId} limit 1;
  `;
  if (userRows.length === 0) {
    throw new HttpError('AI 利用状況の確認対象ユーザーが見つかりませんでした', {
      status: HTTP_STATUS.NOT_FOUND,
      expose: true,
    });
  }

  const usageDay = startOfUsageDay();
  const usageDate = usageDay.toJSDate();

  const premiumUser = await isPremium(userId);
  const tier: UserTier = resolveTierOverride() ?? (premiumUser ? 'PREMIUM' : 'FREE');
  const limit = DAILY_LIMITS[tier];
  const credits = userRows[0].aiCredits ?? 0;

  const counterRows = await sql<{ count: number }[]>`
    select "count" from "AiUsageCounter" where "userId" = ${userId} and "usageDate" = ${usageDate} limit 1;
  `;
  const used = counterRows[0]?.count ?? 0;
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
  const usageDate = usageDay.toJSDate();

  const result = await sql.begin(async (tx) => {
    const userRows = await tx<{ aiCredits: number }[]>`
      select "aiCredits" from "User" where "id" = ${params.userId} for update;
    `;
    if (userRows.length === 0) {
      throw new HttpError('AI 利用記録の対象ユーザーが見つかりませんでした', {
        status: HTTP_STATUS.NOT_FOUND,
        expose: true,
      });
    }

    const counterRows = await tx<{ count: number }[]>`
      insert into "AiUsageCounter" ("userId", "usageDate", "count")
      values (${params.userId}, ${usageDate}, 1)
      on conflict ("userId", "usageDate")
      do update set "count" = "AiUsageCounter"."count" + 1, "lastUsedAt" = now()
      returning "count";
    `;

    let updatedCredits = userRows[0].aiCredits ?? 0;
    let consumedCredit = false;

    if (params.consumeCredit && updatedCredits > 0) {
      const creditRows = await tx<{ aiCredits: number }[]>`
        update "User"
        set "aiCredits" = "aiCredits" - 1
        where "id" = ${params.userId}
        returning "aiCredits";
      `;
      updatedCredits = creditRows[0].aiCredits;
      consumedCredit = true;
    }

    const premiumUser = await isPremium(params.userId, tx);
    const tier: UserTier = resolveTierOverride() ?? (premiumUser ? 'PREMIUM' : 'FREE');
    const limit = DAILY_LIMITS[tier];
    const used = counterRows[0]?.count ?? 0;
    const remaining = Math.max(limit - used, 0);

    return {
      plan: tier,
      limit,
      used,
      remaining,
      credits: updatedCredits,
      consumedCredit,
      resetsAt: nextResetIso(usageDay),
    } satisfies AiUsageSummary;
  });

  return result;
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
