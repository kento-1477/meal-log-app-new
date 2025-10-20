import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { StatusCodes } from 'http-status-codes';
import type { Locale } from '@meal-log/shared';
import { prisma } from '../db/prisma.js';
import { resolveMealLogLocalization } from '../utils/locale.js';

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

export async function getMealLogSharePayload(userId: number, mealLogId: string, locale: Locale): Promise<SharePayload> {
  const mealLog = await prisma.mealLog.findFirst({
    where: { id: mealLogId, userId, deletedAt: null },
  });

  if (!mealLog) {
    const error = new Error('食事記録が見つかりませんでした');
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

  const localization = resolveMealLogLocalization(mealLog.aiRaw, locale);
  const translation = localization.translation;
  const text = formatShareText({
    foodItem: translation?.dish ?? mealLog.foodItem,
    calories: mealLog.calories,
    proteinG: mealLog.proteinG,
    fatG: mealLog.fatG,
    carbsG: mealLog.carbsG,
    createdAt: mealLog.createdAt,
    resolvedLocale: localization.resolvedLocale,
    fallbackApplied: localization.fallbackApplied,
    requestedLocale: localization.requestedLocale,
  }, locale);

  return {
    text,
    token: tokenRecord.token,
    expiresAt: tokenRecord.expiresAt.toISOString(),
  };
}

export async function getLogsForExport(userId: number, { range, anchor }: ExportRange, locale: Locale) {
  const { from, to } = resolveRange(range, anchor);

  const mealLogs = await prisma.mealLog.findMany({
    where: {
      userId,
      createdAt: {
        gte: from.toJSDate(),
        lt: to.toJSDate(),
      },
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  const items = mealLogs.map((log) => {
    const localization = resolveMealLogLocalization(log.aiRaw, locale);
    const translation = localization.translation;
    return {
      id: log.id,
      recordedAt: log.createdAt.toISOString(),
      foodItem: translation?.dish ?? log.foodItem,
      calories: log.calories,
      proteinG: log.proteinG,
      fatG: log.fatG,
      carbsG: log.carbsG,
      mealPeriod: log.mealPeriod ?? null,
      locale: localization.resolvedLocale,
      requestedLocale: localization.requestedLocale,
      fallbackApplied: localization.fallbackApplied,
    };
  });

  return {
    from: from.toISO(),
    to: to.toISO(),
    items,
  };
}

const SHARE_STRINGS = {
  ja: {
    heading: '食事記録',
    calories: 'カロリー',
    macros: (protein: number, fat: number, carbs: number) => `P: ${roundLabel(protein)} g / F: ${roundLabel(fat)} g / C: ${roundLabel(carbs)} g`,
    recordedAt: '記録日時',
    fallback: (requested: Locale, resolved: Locale) => `※ ${requested} 未対応のため ${resolved} を表示しています`,
  },
  en: {
    heading: 'Meal Log',
    calories: 'Calories',
    macros: (protein: number, fat: number, carbs: number) => `Macros — P: ${roundLabel(protein)} g / F: ${roundLabel(fat)} g / C: ${roundLabel(carbs)} g`,
    recordedAt: 'Recorded at',
    fallback: (requested: Locale, resolved: Locale) => `* Showing in ${resolved} because ${requested} is not available`,
  },
} satisfies Record<'ja' | 'en', {
  heading: string;
  calories: string;
  macros: (protein: number, fat: number, carbs: number) => string;
  recordedAt: string;
  fallback: (requested: Locale, resolved: Locale) => string;
}>;

function resolveShareStrings(locale: Locale) {
  if (locale?.toLowerCase().startsWith('en')) {
    return SHARE_STRINGS.en;
  }
  return SHARE_STRINGS.ja;
}

function formatShareText(
  log: {
    foodItem: string;
    calories: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
    createdAt: Date;
    resolvedLocale: Locale;
    requestedLocale: Locale;
    fallbackApplied: boolean;
  },
  locale: Locale,
) {
  const strings = resolveShareStrings(locale);
  const recordedAt = DateTime.fromJSDate(log.createdAt).setZone('Asia/Tokyo').setLocale(locale.startsWith('en') ? 'en' : 'ja');
  const lines = [
    `${strings.heading}: ${log.foodItem}`,
    `${strings.calories}: ${Math.round(log.calories)} kcal`,
    strings.macros(log.proteinG, log.fatG, log.carbsG),
    `${strings.recordedAt}: ${recordedAt.toFormat('yyyy/LL/dd HH:mm')}`,
  ];
  if (log.fallbackApplied && log.requestedLocale !== log.resolvedLocale) {
    lines.push(strings.fallback(log.requestedLocale, log.resolvedLocale));
  }
  return lines.join('\n');
}

function resolveRange(range: ExportRange['range'], anchor?: string) {
  const base = anchor ? DateTime.fromISO(anchor) : DateTime.now();
  if (!base.isValid) {
    throw Object.assign(new Error('アンカー日付が無効です'), {
      statusCode: StatusCodes.BAD_REQUEST,
      expose: true,
    });
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
      throw Object.assign(new Error('未対応の期間指定です'), {
        statusCode: StatusCodes.BAD_REQUEST,
        expose: true,
      });
  }
}

function roundLabel(value: number) {
  return Math.round(value * 10) / 10;
}
