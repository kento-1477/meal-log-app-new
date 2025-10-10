import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { MealPeriod } from '@prisma/client';
import { UpdateMealLogRequestSchema } from '@meal-log/shared';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/require-auth.js';
import { updateMealLog } from '../services/log-service.js';

export const logsRouter = Router();

const mealPeriodLookup: Record<string, MealPeriod> = {
  breakfast: MealPeriod.BREAKFAST,
  lunch: MealPeriod.LUNCH,
  dinner: MealPeriod.DINNER,
  snack: MealPeriod.SNACK,
};

const toMealPeriodLabel = (period: MealPeriod | null | undefined) =>
  period ? period.toLowerCase() : null;

const fetchMealLogDetail = async (logId: string, userId: number) => {
  const item = await prisma.mealLog.findFirst({
    where: { id: logId, userId },
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
    },
  });

  if (!item) {
    return null;
  }

  const history = item.edits.map((edit) => ({
    id: edit.id,
    created_at: edit.createdAt.toISOString(),
    user_id: edit.userId,
    user_email: edit.user?.email ?? null,
    user_name: edit.user?.username ?? null,
    changes: edit.changes ?? {},
  }));

  return {
    id: item.id,
    food_item: item.foodItem,
    protein_g: item.proteinG,
    fat_g: item.fatG,
    carbs_g: item.carbsG,
    calories: item.calories,
    meal_period: toMealPeriodLabel(item.mealPeriod) ?? item.landingType ?? null,
    created_at: item.createdAt.toISOString(),
    image_url: item.imageUrl,
    ai_raw: item.aiRaw,
    history,
  };
};

logsRouter.get('/logs', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);

    const items = await prisma.mealLog.findMany({
      where: { userId: req.session.userId! },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const responseItems = items.map((item) => ({
      id: item.id,
      created_at: item.createdAt.toISOString(),
      dish: item.foodItem,
      protein_g: item.proteinG,
      fat_g: item.fatG,
      carbs_g: item.carbsG,
      calories: item.calories,
      meal_period: toMealPeriodLabel(item.mealPeriod) ?? item.landingType ?? null,
      image_url: item.imageUrl,
      thumbnail_url: item.imageUrl,
      ai_raw: item.aiRaw,
    }));

    res.status(StatusCodes.OK).json({ ok: true, items: responseItems });
  } catch (error) {
    next(error);
  }
});


logsRouter.get('/logs/summary', requireAuth, async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days ?? 7), 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const logs = await prisma.mealLog.findMany({
      where: {
        userId: req.session.userId!,
        createdAt: { gte: since },
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
    const detail = await fetchMealLogDetail(req.params.id, req.session.userId!);
    if (!detail) {
      return res.status(StatusCodes.NOT_FOUND).json({ ok: false, message: 'not found' });
    }
    res.status(StatusCodes.OK).json({
      ok: true,
      item: detail,
    });
  } catch (error) {
    next(error);
  }
});

logsRouter.patch('/log/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = UpdateMealLogRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: parsed.error.flatten().formErrors.join(', ') });
    }

    const payload = parsed.data;
    const mealPeriod = payload.meal_period ? mealPeriodLookup[payload.meal_period] : undefined;
    if (payload.meal_period && !mealPeriod) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: 'Invalid meal period' });
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

    const detail = await fetchMealLogDetail(req.params.id, req.session.userId!);
    if (!detail) {
      return res.status(StatusCodes.NOT_FOUND).json({ ok: false, message: 'not found' });
    }

    res.status(StatusCodes.OK).json({ ok: true, item: detail });
  } catch (error) {
    next(error);
  }
});
