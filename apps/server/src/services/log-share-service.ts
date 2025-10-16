import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../db/prisma.js';

const SHARE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface SharePayload {
  text: string;
  token: string;
  expiresAt: string;
}

interface ExportRange {
  range: 'day' | 'week' | 'month';
  anchor?: string;
}

export async function getMealLogSharePayload(userId: number, mealLogId: string): Promise<SharePayload> {
  const mealLog = await prisma.mealLog.findFirst({
    where: { id: mealLogId, userId },
  });

  if (!mealLog) {
    const error = new Error('Meal log not found');
    Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
    throw error;
  }

  const now = Date.now();
  const existing = await prisma.logShareToken.findFirst({
    where: {
      mealLogId,
      userId,
      expiresAt: { gt: new Date(now) },
    },
  });

  const tokenRecord = existing
    ? await prisma.logShareToken.update({
        where: { id: existing.id },
        data: { lastAccessed: new Date(now) },
      })
    : await prisma.logShareToken.create({
        data: {
          token: randomUUID(),
          mealLogId,
          userId,
          expiresAt: new Date(now + SHARE_TOKEN_TTL_MS),
        },
      });

  return {
    text: formatShareText(mealLog),
    token: tokenRecord.token,
    expiresAt: tokenRecord.expiresAt.toISOString(),
  };
}

export async function getLogsForExport(userId: number, { range, anchor }: ExportRange) {
  const { from, to } = resolveRange(range, anchor);

  const mealLogs = await prisma.mealLog.findMany({
    where: {
      userId,
      createdAt: {
        gte: from.toJSDate(),
        lt: to.toJSDate(),
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    from: from.toISO(),
    to: to.toISO(),
    items: mealLogs.map((log) => ({
      id: log.id,
      recordedAt: log.createdAt.toISOString(),
      foodItem: log.foodItem,
      calories: log.calories,
      proteinG: log.proteinG,
      fatG: log.fatG,
      carbsG: log.carbsG,
      mealPeriod: log.mealPeriod ?? null,
    })),
  };
}

function formatShareText(log: { foodItem: string; calories: number; proteinG: number; fatG: number; carbsG: number; createdAt: Date }) {
  const recordedAtJst = DateTime.fromJSDate(log.createdAt).setZone('Asia/Tokyo');
  const lines = [
    `食事記録: ${log.foodItem}`,
    `カロリー: ${Math.round(log.calories)} kcal`,
    `P: ${roundLabel(log.proteinG)} g / F: ${roundLabel(log.fatG)} g / C: ${roundLabel(log.carbsG)} g`,
    `記録日時: ${recordedAtJst.toFormat('yyyy/LL/dd HH:mm')}`,
  ];
  return lines.join('\n');
}

function resolveRange(range: ExportRange['range'], anchor?: string) {
  const base = anchor ? DateTime.fromISO(anchor) : DateTime.now();
  if (!base.isValid) {
    throw Object.assign(new Error('Invalid anchor date'), { statusCode: StatusCodes.BAD_REQUEST, expose: true });
  }

  switch (range) {
    case 'day': {
      const from = base.startOf('day');
      const to = from.plus({ days: 1 });
      return { from, to };
    }
    case 'week': {
      const from = base.startOf('week');
      const to = from.plus({ weeks: 1 });
      return { from, to };
    }
    case 'month': {
      const from = base.startOf('month');
      const to = from.plus({ months: 1 });
      return { from, to };
    }
    default:
      throw Object.assign(new Error('Unsupported range'), { statusCode: StatusCodes.BAD_REQUEST, expose: true });
  }
}

function roundLabel(value: number) {
  return Math.round(value * 10) / 10;
}
