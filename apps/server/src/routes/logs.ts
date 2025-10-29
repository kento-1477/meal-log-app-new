import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { MealPeriod, Prisma } from '@prisma/client';
import { UpdateMealLogRequestSchema, type GeminiNutritionResponse, type Locale } from '@meal-log/shared';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/require-auth.js';
import { updateMealLog, deleteMealLog, restoreMealLog } from '../services/log-service.js';
import { getMealLogSharePayload, getLogsForExport } from '../services/log-share-service.js';
import { isPremium } from '../services/premium-service.js';
import { resolveRequestLocale } from '../utils/request-locale.js';
import { resolveMealLogLocalization, type LocalizationResolution } from '../utils/locale.js';
import { normalizeTimezone, resolveRequestTimezone } from '../utils/timezone.js';

export const logsRouter = Router();

const mealPeriodLookup: Record<string, MealPeriod> = {
  breakfast: MealPeriod.BREAKFAST,
  lunch: MealPeriod.LUNCH,
  dinner: MealPeriod.DINNER,
  snack: MealPeriod.SNACK,
};

const toMealPeriodLabel = (period: MealPeriod | null | undefined) =>
  period ? period.toLowerCase() : null;

type LogsRangeKey = 'today' | 'week' | 'twoWeeks' | 'threeWeeks' | 'month' | 'threeMonths';

interface LogsRange {
  key: LogsRangeKey;
  from: Date;
  to: Date;
}

function resolveLogsRange(
  key: string | undefined,
  timezone: string,
  options: { allowThreeMonths?: boolean } = {},
): LogsRange | null {
  const normalizedKey = (key as LogsRangeKey | undefined) ?? 'today';
  const zone = normalizeTimezone(timezone);
  const now = DateTime.now().setZone(zone).startOf('day');
  const allowThreeMonths = options.allowThreeMonths ?? false;

  switch (normalizedKey) {
    case 'today':
      return {
        key: 'today',
        from: now.toUTC().toJSDate(),
        to: now.plus({ days: 1 }).toUTC().toJSDate(),
      } satisfies LogsRange;
    case 'week':
    case 'twoWeeks':
    case 'threeWeeks':
    case 'month': {
      const durationMap = {
        week: 7,
        twoWeeks: 14,
        threeWeeks: 21,
        month: 30,
      } as const;
      const days = durationMap[normalizedKey as keyof typeof durationMap];
      if (!days) {
        return null;
      }
      const from = now.minus({ days: days - 1 });
      return {
        key: normalizedKey,
        from: from.toUTC().toJSDate(),
        to: now.plus({ days: 1 }).toUTC().toJSDate(),
      } satisfies LogsRange;
    }
    case 'threeMonths': {
      if (!allowThreeMonths) {
        return null;
      }
      const from = now.minus({ days: 89 });
      return {
        key: 'threeMonths',
        from: from.toUTC().toJSDate(),
        to: now.plus({ days: 1 }).toUTC().toJSDate(),
      } satisfies LogsRange;
    }
    default:
      return null;
  }
}

const fetchMealLogDetail = async (logId: string, userId: number, locale: Locale) => {
  const item = await prisma.mealLog.findFirst({
    where: { id: logId, userId, deletedAt: null },
    include: {
      edits: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      favoritedBy: {
        select: { id: true },
        take: 1,
      },
      periodHistory: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!item) {
    return null;
  }

  const localization = resolveMealLogLocalization(item.aiRaw, locale);
  const translation = localization.translation;
  const aiRawPayload = buildAiRawPayload(localization);

  const history = item.edits.map((edit) => ({
    id: edit.id,
    created_at: edit.createdAt.toISOString(),
    user_id: edit.userId,
    user_email: edit.user?.email ?? null,
    user_name: edit.user?.username ?? null,
    changes: edit.changes ?? {},
  }));

  const timeHistory = item.periodHistory.map((entry) => ({
    id: entry.id,
    previous: toMealPeriodLabel(entry.previousMealPeriod) ?? null,
    next: toMealPeriodLabel(entry.nextMealPeriod) ?? null,
    source: entry.source,
    changed_at: entry.createdAt.toISOString(),
  }));

  return {
    id: item.id,
    food_item: translation?.dish ?? item.foodItem,
    protein_g: item.proteinG,
    fat_g: item.fatG,
    carbs_g: item.carbsG,
    calories: item.calories,
    meal_period: toMealPeriodLabel(item.mealPeriod) ?? item.landingType ?? null,
    created_at: item.createdAt.toISOString(),
    image_url: item.imageUrl,
    ai_raw: aiRawPayload,
    locale: localization.resolvedLocale,
    requested_locale: localization.requestedLocale,
    fallback_applied: localization.fallbackApplied,
    favorite_meal_id: item.favoritedBy[0]?.id ?? null,
    history,
    time_history: timeHistory,
  };
};

logsRouter.get('/logs', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);
    const locale = resolveRequestLocale(req);
    const timezone = resolveRequestTimezone(req);
    req.session.locale = locale;
    req.session.timezone = timezone;

    const rangeKey = typeof req.query.range === 'string' ? req.query.range : undefined;
    const userId = req.session.userId!;
    const premiumUser = await isPremium(userId);
    const range = resolveLogsRange(rangeKey, timezone, { allowThreeMonths: premiumUser });

    if (!range) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        ok: false,
        error: '指定した期間は利用できません',
      });
    }

    const whereClause = {
      userId,
      deletedAt: null,
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
    } satisfies Prisma.MealLogWhereInput;

    const items = await prisma.mealLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        favoritedBy: {
          select: { id: true },
          take: 1,
        },
      },
    });

    const responseItems = items.map((item) => {
      const localization = resolveMealLogLocalization(item.aiRaw, locale);
      const translation = localization.translation;
      return {
        id: item.id,
        created_at: item.createdAt.toISOString(),
        dish: translation?.dish ?? item.foodItem,
        protein_g: item.proteinG,
        fat_g: item.fatG,
        carbs_g: item.carbsG,
        calories: item.calories,
        meal_period: toMealPeriodLabel(item.mealPeriod) ?? item.landingType ?? null,
        image_url: item.imageUrl,
        thumbnail_url: item.imageUrl,
        ai_raw: buildAiRawPayload(localization),
        locale: localization.resolvedLocale,
        requested_locale: localization.requestedLocale,
        fallback_applied: localization.fallbackApplied,
        favorite_meal_id: item.favoritedBy[0]?.id ?? null,
      };
    });

    res.status(StatusCodes.OK).json({ ok: true, items: responseItems, range: range.key, timezone });
  } catch (error) {
    next(error);
  }
});


logsRouter.get('/logs/summary', requireAuth, async (req, res, next) => {
  try {
    const locale = resolveRequestLocale(req);
    req.session.locale = locale;
    const days = Math.min(Number(req.query.days ?? 7), 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const logs = await prisma.mealLog.findMany({
      where: {
        userId: req.session.userId!,
        createdAt: { gte: since },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dayBuckets = new Map<string, {
      calories: number;
      protein_g: number;
      fat_g: number;
      carbs_g: number;
    }>();

    for (const log of logs) {
      const dayKey = log.createdAt.toISOString().slice(0, 10);
      const bucket = dayBuckets.get(dayKey) ?? { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
      bucket.calories += log.calories;
      bucket.protein_g += log.proteinG;
      bucket.fat_g += log.fatG;
      bucket.carbs_g += log.carbsG;
      dayBuckets.set(dayKey, bucket);
    }

    const daily = Array.from(dayBuckets.entries()).map(([date, totals]) => ({ date, ...totals }));
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = dayBuckets.get(todayKey) ?? { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

    res.status(StatusCodes.OK).json({ ok: true, today, daily });
  } catch (error) {
    next(error);
  }
});
logsRouter.get('/log/:id', requireAuth, async (req, res, next) => {
  try {
    const locale = resolveRequestLocale(req);
    req.session.locale = locale;
    const detail = await fetchMealLogDetail(req.params.id, req.session.userId!, locale);
    if (!detail) {
      return res.status(StatusCodes.NOT_FOUND).json({ ok: false, message: '記録が見つかりませんでした。' });
    }
    res.status(StatusCodes.OK).json({
      ok: true,
      item: detail,
    });
  } catch (error) {
    next(error);
  }
});

logsRouter.get('/log/:id/share', requireAuth, async (req, res, next) => {
  try {
    const locale = resolveRequestLocale(req);
    req.session.locale = locale;
    const payload = await getMealLogSharePayload(req.session.userId!, req.params.id, locale);
    res.status(StatusCodes.OK).json({ ok: true, share: payload });
  } catch (error) {
    next(error);
  }
});

logsRouter.delete('/log/:id', requireAuth, async (req, res, next) => {
  try {
    const deleted = await deleteMealLog(req.params.id, req.session.userId!);
    res.status(StatusCodes.OK).json({ ok: true, deletedAt: deleted.deletedAt?.toISOString() ?? null });
  } catch (error) {
    next(error);
  }
});

logsRouter.post('/log/:id/restore', requireAuth, async (req, res, next) => {
  try {
    await restoreMealLog(req.params.id, req.session.userId!);
    res.status(StatusCodes.OK).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

logsRouter.patch('/log/:id', requireAuth, async (req, res, next) => {
  try {
    const locale = resolveRequestLocale(req);
    req.session.locale = locale;
    const parsed = UpdateMealLogRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: parsed.error.flatten().formErrors.join(', ') });
    }

    const payload = parsed.data;
    const mealPeriod = payload.meal_period ? mealPeriodLookup[payload.meal_period] : undefined;
    if (payload.meal_period && !mealPeriod) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ ok: false, error: '指定された時間帯タグが正しくありません。' });
    }

    await updateMealLog({
      logId: req.params.id,
      userId: req.session.userId!,
      updates: {
        foodItem: payload.food_item,
        calories: payload.calories,
        proteinG: payload.protein_g,
        fatG: payload.fat_g,
        carbsG: payload.carbs_g,
        mealPeriod,
      },
    });

    const detail = await fetchMealLogDetail(req.params.id, req.session.userId!, locale);
    if (!detail) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ ok: false, message: '記録が見つかりませんでした。' });
    }

    res.status(StatusCodes.OK).json({ ok: true, item: detail });
  } catch (error) {
    next(error);
  }
});

const exportQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month']).default('day'),
  anchor: z.string().optional(),
});

logsRouter.get('/logs/export', requireAuth, async (req, res, next) => {
  try {
    const locale = resolveRequestLocale(req);
    req.session.locale = locale;
    const query = exportQuerySchema.parse(req.query);
    const dataset = await getLogsForExport(req.session.userId!, query, locale);
    res.status(StatusCodes.OK).json({ ok: true, range: query.range, export: dataset });
  } catch (error) {
    next(error);
  }
});

type SerializedAiRaw = Partial<GeminiNutritionResponse> & {
  locale: Locale;
  translations: Record<Locale, GeminiNutritionResponse>;
};

function buildAiRawPayload(localization: LocalizationResolution): SerializedAiRaw | undefined {
  const translation = localization.translation;
  if (!translation) {
    return undefined;
  }

  return {
    ...cloneResponse(translation),
    locale: localization.resolvedLocale,
    translations: cloneTranslations(localization.translations),
  } satisfies SerializedAiRaw;
}

function cloneResponse(payload: GeminiNutritionResponse): GeminiNutritionResponse {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}

function cloneTranslations(translations: Record<Locale, GeminiNutritionResponse>) {
  const entries = Object.entries(translations).map(([locale, value]) => [locale, cloneResponse(value)] as const);
  return Object.fromEntries(entries) as Record<Locale, GeminiNutritionResponse>;
}
