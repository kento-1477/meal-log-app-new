import { DateTime } from 'luxon';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../db/prisma.js';
import { UserPlan } from '@prisma/client';

const DAILY_LIMITS: Record<UserPlan, number> = {
  FREE: 3,
  STANDARD: 20,
};

const USAGE_TIMEZONE = 'Asia/Tokyo';
const PLAN_OVERRIDE: UserPlan | null = process.env.NODE_ENV !== 'production' ? 'STANDARD' : null;

export interface AiUsageStatus {
  allowed: boolean;
  plan: UserPlan;
  limit: number;
  used: number;
  remaining: number;
  credits: number;
  consumeCredit: boolean;
  usageDate: Date;
}

export interface AiUsageSummary {
  plan: UserPlan;
  limit: number;
  used: number;
  remaining: number;
  credits: number;
  consumedCredit: boolean;
  resetsAt: string;
}

function startOfUsageDay(now: Date = new Date()) {
  return DateTime.fromJSDate(now).setZone(USAGE_TIMEZONE).startOf('day');
}

export async function evaluateAiUsage(userId: number): Promise<AiUsageStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, aiCredits: true },
  });

  if (!user) {
    const error = new Error('AI 利用状況の確認対象ユーザーが見つかりませんでした');
    Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
    throw error;
  }

  const usageDay = startOfUsageDay();
  const usageDate = usageDay.toJSDate();
  const plan = PLAN_OVERRIDE ?? user.plan;
  const limit = DAILY_LIMITS[plan];
  const credits = user.aiCredits ?? 0;

  const counter = await prisma.aiUsageCounter.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
  });

  const used = counter?.count ?? 0;
  const remaining = Math.max(limit - used, 0);
  const consumeCredit = remaining === 0 && credits > 0;
  const allowed = remaining > 0 || consumeCredit;

  return {
    allowed,
    plan,
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

  const summary = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: params.userId },
      select: { plan: true, aiCredits: true },
    });
    if (!user) {
      const error = new Error('AI 利用記録の対象ユーザーが見つかりませんでした');
      Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
      throw error;
    }

    const updatedCounter = await tx.aiUsageCounter.upsert({
      where: {
        userId_usageDate: {
          userId: params.userId,
          usageDate,
        },
      },
      update: {
        count: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        userId: params.userId,
        usageDate,
        count: 1,
      },
    });

    let updatedCredits = user.aiCredits ?? 0;
    let consumedCredit = false;
    if (params.consumeCredit && updatedCredits > 0) {
      const result = await tx.user.update({
        where: { id: params.userId },
        data: { aiCredits: { decrement: 1 } },
        select: { aiCredits: true },
      });
      updatedCredits = result.aiCredits;
      consumedCredit = true;
    }

    const plan = PLAN_OVERRIDE ?? user.plan;
    const limit = DAILY_LIMITS[plan];
    const used = updatedCounter.count;
    const remaining = Math.max(limit - used, 0);

    return {
      plan,
      limit,
      used,
      remaining,
      credits: updatedCredits,
      consumedCredit,
      resetsAt: usageDay.plus({ days: 1 }).toISO(),
    } satisfies AiUsageSummary;
  });

  return summary;
}

export function buildUsageLimitError(status: AiUsageStatus) {
  const error = new Error('AI の利用上限に達しました');
  Object.assign(error, {
    statusCode: StatusCodes.TOO_MANY_REQUESTS,
    expose: true,
    code: 'AI_USAGE_LIMIT',
    data: {
      plan: status.plan,
      limit: status.limit,
      used: status.used,
      remaining: status.remaining,
      credits: status.credits,
      resetsAt: DateTime.fromJSDate(status.usageDate).setZone(USAGE_TIMEZONE).startOf('day').plus({ days: 1 }).toISO(),
    },
  });
  return error;
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
    resetsAt: usageDay.plus({ days: 1 }).toISO(),
  } satisfies AiUsageSummary;
}
