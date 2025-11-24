import { z } from 'zod';
import { DateTime } from 'luxon';
import type {
  Locale,
  MealLogDetail,
  MealLogListResponse,
  UpdateMealLogRequest,
  FavoriteMealDraft,
  GeminiNutritionResponse,
  FavoriteMeal,
} from '@shared/index.js';
import {
  UpdateMealLogRequestSchema,
  GeminiNutritionResponseSchema,
  FavoriteMealCreateRequestSchema,
  FavoriteMealUpdateRequestSchema,
  FavoriteMealDetailResponseSchema,
  FavoriteMealListResponseSchema,
  DashboardSummarySchema,
  DashboardTargetsSchema,
  CalorieTrendResponseSchema,
} from '@shared/index.js';
import type { Context } from 'hono';
import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { requireAuth } from '../_shared/auth.ts';
import { resolveMealLogLocalization, type LocalizationResolution, parseMealLogAiRaw, normalizeLocale, DEFAULT_LOCALE } from '../_shared/locale.ts';
import { resolveRequestLocale } from '../_shared/request.ts';
import { resolveRequestTimezone, normalizeTimezone } from '../_shared/timezone.ts';
import { sql, withTransaction } from '../_shared/db.ts';
import { isPremium, evaluateAiUsage, recordAiUsage, summarizeUsageStatus, buildUsageLimitError } from '../_shared/ai.ts';
import type { JwtUser } from '../_shared/auth.ts';

const app = createApp();
const DASHBOARD_TIMEZONE = Deno.env.get('DASHBOARD_TIMEZONE') ?? 'Asia/Tokyo';
const DASHBOARD_TARGETS = {
  calories: { unit: 'kcal', value: 2200, decimals: 0 },
  protein_g: { unit: 'g', value: 130, decimals: 1 },
  fat_g: { unit: 'g', value: 70, decimals: 1 },
  carbs_g: { unit: 'g', value: 260, decimals: 1 },
} as const;

const toMealPeriodLabel = (period: string | null | undefined) => (period ? period.toLowerCase() : null);

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
      };
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
      };
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
      };
    }
    default:
      return null;
  }
}

const logsQuerySchema = z.object({
  range: z.enum(['today', 'week', 'twoWeeks', 'threeWeeks', 'month', 'threeMonths']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const dashboardQuerySchema = z.object({
  period: z.enum(['today', 'yesterday', 'thisWeek', 'lastWeek', 'custom']).default('today'),
  from: z.string().optional(),
  to: z.string().optional(),
});

const calorieQuerySchema = z.object({
  range: z.coerce
    .number()
    .optional()
    .refine((value) => value == null || value === 7 || value === 30, 'range must be either 7 or 30'),
  mode: z.enum(['daily', 'weekly', 'monthly']).optional(),
  locale: z.string().optional(),
});

app.get('/health', (c) => c.json({ ok: true, service: 'meal-log' }));

app.get('/api/logs', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const locale = resolveRequestLocale(c.req.raw);
  const timezone = resolveRequestTimezone(c.req.raw, { fallback: DASHBOARD_TIMEZONE });
  const query = logsQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  if (!query.success) {
    throw new HttpError('invalid query', { status: HTTP_STATUS.BAD_REQUEST, expose: true, data: query.error.flatten() });
  }

  const premiumUser = await isPremium(user.id);
  const range = resolveLogsRange(query.data.range, timezone, { allowThreeMonths: premiumUser });
  if (!range) {
    throw new HttpError('指定した期間は利用できません', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  const rows = await sql<
    Array<{
      id: string;
      foodItem: string;
      calories: number;
      proteinG: number;
      fatG: number;
      carbsG: number;
      mealPeriod: string | null;
      landingType: string | null;
      createdAt: Date;
      imageUrl: string | null;
      aiRaw: unknown;
      favoriteId: number | null;
    }>
  >`
    select
      ml."id",
      ml."foodItem",
      ml."calories",
      ml."proteinG",
      ml."fatG",
      ml."carbsG",
      ml."mealPeriod",
      ml."landingType",
      ml."createdAt",
      ml."imageUrl",
      ml."aiRaw",
      fm."id" as "favoriteId"
    from "MealLog" ml
    left join "FavoriteMeal" fm on fm."sourceMealLogId" = ml."id" and fm."userId" = ml."userId"
    where ml."userId" = ${user.id}
      and ml."deletedAt" is null
      and ml."createdAt" >= ${range.from}
      and ml."createdAt" < ${range.to}
    order by ml."createdAt" desc
    limit ${query.data.limit}
    offset ${query.data.offset};
  `;

  const items: MealLogListResponse['items'] = rows.map((row) => {
    const localization = resolveMealLogLocalization(row.aiRaw, locale);
    const translation = localization.translation;
    const dish = translation?.dish ?? row.foodItem;
    return {
      id: row.id,
      created_at: row.createdAt.toISOString(),
      dish,
      protein_g: row.proteinG,
      fat_g: row.fatG,
      carbs_g: row.carbsG,
      calories: row.calories,
      meal_period: toMealPeriodLabel(row.mealPeriod) ?? row.landingType ?? null,
      image_url: row.imageUrl ?? null,
      thumbnail_url: null,
      ai_raw: buildAiRawPayload(localization),
      locale: localization.resolvedLocale,
      requested_locale: localization.requestedLocale,
      fallback_applied: localization.fallbackApplied,
      favorite_meal_id: row.favoriteId ?? null,
    };
  });

  return c.json({ ok: true, items, range: range.key, timezone } satisfies MealLogListResponse);
});

app.get('/api/log/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');
  const locale = resolveRequestLocale(c.req.raw);
  const item = await fetchMealLogDetail({ userId: user.id, logId, locale });
  return c.json({ ok: true, item });
});

app.post('/api/log', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const form = await parseMultipart(c);
  if (!form.message && !form.file) {
    throw new HttpError('メッセージまたは画像のいずれかを送信してください。', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  const idempotencyKey = c.req.header('Idempotency-Key') ?? undefined;
  const locale = resolveRequestLocale(c.req.raw, { queryField: 'locale' });
  const timezone = resolveRequestTimezone(c.req.raw, { queryField: 'timezone', fallback: DASHBOARD_TIMEZONE });

  const response = await processMealLog({
    userId: user.id,
    message: form.message,
    file: form.file,
    idempotencyKey,
    locale,
    timezone,
  });

  return c.json(response);
});

app.delete('/api/log/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');

  const deletedAt = await withTransaction(async (tx) => {
    const existing = await tx<{ id: string }[]>`
      select "id" from "MealLog" where "id" = ${logId} and "userId" = ${user.id} and "deletedAt" is null limit 1;
    `;

    if (!existing[0]) {
      throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
    }

    const deletedAtValue = new Date();

    await tx`delete from "LogShareToken" where "mealLogId" = ${logId};`;
    await tx`
      update "FavoriteMeal"
      set "sourceMealLogId" = null
      where "userId" = ${user.id} and "sourceMealLogId" = ${logId};
    `;
    await tx`
      update "MealLog"
      set "deletedAt" = ${deletedAtValue}
      where "id" = ${logId};
    `;

    return deletedAtValue;
  });

  return c.json({ ok: true, deletedAt: deletedAt.toISOString() });
});

app.post('/api/log/:id/restore', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');

  const restored = await sql<{ id: string }[]>`
    select "id" from "MealLog" where "id" = ${logId} and "userId" = ${user.id} and "deletedAt" is not null limit 1;
  `;

  if (!restored[0]) {
    throw new HttpError('復元対象の食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  await sql`
    update "MealLog"
    set "deletedAt" = null, "updatedAt" = now()
    where "id" = ${logId};
  `;

  return c.json({ ok: true });
});

app.patch('/api/log/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');
  const body = UpdateMealLogRequestSchema.parse(await c.req.json());
  const locale = resolveRequestLocale(c.req.raw);

  const updatedLog = await withTransaction(async (tx) => {
    const existingRows = await tx<
      Array<{
        id: string;
        userId: number;
        foodItem: string;
        calories: number;
        proteinG: number;
        fatG: number;
        carbsG: number;
        mealPeriod: string | null;
        aiRaw: unknown;
      }>
    >`
      select
        "id",
        "userId",
        "foodItem",
        "calories",
        "proteinG",
        "fatG",
        "carbsG",
        "mealPeriod",
        "aiRaw"
      from "MealLog"
      where "id" = ${logId}
        and "userId" = ${user.id}
        and "deletedAt" is null
      limit 1;
    `;

    const log = existingRows[0];
    if (!log) {
      throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
    }

    const updates = mapUpdatePayload(body);
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    const setParts: Array<ReturnType<typeof sql>> = [sql`"version" = "version" + 1`, sql`"updatedAt" = now()`];

    if (typeof updates.foodItem === 'string' && updates.foodItem !== log.foodItem) {
      changes.foodItem = { before: log.foodItem, after: updates.foodItem };
      setParts.push(sql`"foodItem" = ${updates.foodItem}`);
    }
    if (typeof updates.calories === 'number' && updates.calories !== log.calories) {
      changes.calories = { before: log.calories, after: updates.calories };
      setParts.push(sql`"calories" = ${updates.calories}`);
    }
    if (typeof updates.proteinG === 'number' && updates.proteinG !== log.proteinG) {
      changes.proteinG = { before: log.proteinG, after: updates.proteinG };
      setParts.push(sql`"proteinG" = ${updates.proteinG}`);
    }
    if (typeof updates.fatG === 'number' && updates.fatG !== log.fatG) {
      changes.fatG = { before: log.fatG, after: updates.fatG };
      setParts.push(sql`"fatG" = ${updates.fatG}`);
    }
    if (typeof updates.carbsG === 'number' && updates.carbsG !== log.carbsG) {
      changes.carbsG = { before: log.carbsG, after: updates.carbsG };
      setParts.push(sql`"carbsG" = ${updates.carbsG}`);
    }

    const previousMealPeriod = log.mealPeriod;
    if (typeof updates.mealPeriod !== 'undefined' && updates.mealPeriod !== log.mealPeriod) {
      changes.mealPeriod = { before: log.mealPeriod, after: updates.mealPeriod };
      setParts.push(sql`"mealPeriod" = ${updates.mealPeriod}`);
    }

    let updatedAiRaw = log.aiRaw;
    if (Object.keys(changes).length > 0) {
      updatedAiRaw = buildUpdatedAiRaw(log.aiRaw, updates);
      setParts.push(sql`"aiRaw" = ${sql.json(updatedAiRaw)}`);
    }

    if (setParts.length === 2) {
      // No changes requested
      return log;
    }

    const updatedRows = await tx<
      Array<{
        id: string;
      }>
    >`
      update "MealLog"
      set ${sql.join(setParts, sql`, `)}
      where "id" = ${logId}
      returning "id";
    `;

    if (typeof updates.mealPeriod !== 'undefined' && updates.mealPeriod !== previousMealPeriod) {
      await tx`
        insert into "MealLogPeriodHistory" ("mealLogId", "previousMealPeriod", "nextMealPeriod", "source")
        values (${logId}, ${previousMealPeriod}, ${updates.mealPeriod}, 'manual');
      `;
    }

    if (Object.keys(changes).length > 0) {
      await tx`
        insert into "MealLogEdit" ("mealLogId", "userId", "changes")
        values (${logId}, ${user.id}, ${sql.json(changes)});
      `;
    }

    return updatedRows[0];
  });

  const item = await fetchMealLogDetail({ userId: user.id, logId: updatedLog.id, locale });
  return c.json({ ok: true, item });
});

// Favorites
app.get('/api/favorites', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const favorites = await listFavoriteMeals(user.id);
  const payload = { ok: true, items: favorites } as const;
  FavoriteMealListResponseSchema.parse(payload);
  return c.json(payload);
});

app.post('/api/favorites', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const body = await c.req.json();
  FavoriteMealCreateRequestSchema.parse(body);
  const favorite = await createFavoriteMeal(user.id, body);
  const payload = { ok: true, item: favorite } as const;
  FavoriteMealDetailResponseSchema.parse(payload);
  return c.json(payload, HTTP_STATUS.CREATED);
});

app.get('/api/favorites/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('invalid id', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
  const favorite = await getFavoriteMeal(user.id, id);
  const payload = { ok: true, item: favorite } as const;
  FavoriteMealDetailResponseSchema.parse(payload);
  return c.json(payload);
});

app.patch('/api/favorites/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('invalid id', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
  const body = await c.req.json();
  FavoriteMealUpdateRequestSchema.parse(body);
  const favorite = await updateFavoriteMeal(user.id, id, body);
  const payload = { ok: true, item: favorite } as const;
  FavoriteMealDetailResponseSchema.parse(payload);
  return c.json(payload);
});

app.delete('/api/favorites/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('invalid id', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
  await deleteFavoriteMeal(user.id, id);
  return c.body(null, HTTP_STATUS.NO_CONTENT);
});

app.post('/api/favorites/:id/log', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError('invalid id', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
  const result = await logFavoriteMeal(user.id, id);
  return c.json(result, HTTP_STATUS.CREATED);
});

// Dashboard / metrics
app.get('/api/dashboard/summary', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const url = new URL(c.req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = dashboardQuerySchema.safeParse(params);
  if (!parsed.success) {
    throw new HttpError('invalid query', { status: HTTP_STATUS.BAD_REQUEST, expose: true, data: parsed.error.flatten() });
  }
  const summary = await getDashboardSummary({
    userId: user.id,
    period: parsed.data.period,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  const payload = { ok: true, summary } as const;
  DashboardSummarySchema.parse(summary);
  return c.json(payload);
});

app.get('/api/dashboard/targets', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const targets = await resolveUserTargets(user.id);
  const payload = { ok: true, targets };
  DashboardTargetsSchema.parse(targets);
  return c.json(payload);
});

app.get('/api/calories', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const url = new URL(c.req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = calorieQuerySchema.safeParse(params);
  if (!parsed.success) {
    throw new HttpError('invalid query', { status: HTTP_STATUS.BAD_REQUEST, expose: true, data: parsed.error.flatten() });
  }
  const mode = parsed.data.mode ?? (parsed.data.range === 30 ? 'monthly' : parsed.data.range === 7 ? 'weekly' : 'daily');
  const locale = resolveRequestLocale(c.req.raw, { queryField: 'locale' });
  const payload = await buildCalorieTrend({
    userId: user.id,
    mode,
    locale,
  });
  CalorieTrendResponseSchema.parse(payload);
  return c.json({ ok: true, ...payload });
});

app.get('/api/streak', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const streak = await getUserStreak(user.id);
  return c.json({ ok: true, streak });
});

app.options('*', (c) => c.text('ok'));

export default app;

type SerializedAiRaw = Partial<NonNullable<LocalizationResolution['translation']>> & {
  locale: Locale;
  translations: Record<Locale, NonNullable<LocalizationResolution['translation']>>;
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
  };
}

function cloneResponse(payload: NonNullable<LocalizationResolution['translation']>) {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}

function cloneTranslations(translations: Record<Locale, LocalizationResolution['translation']>) {
  const entries = Object.entries(translations)
    .filter(([, value]) => Boolean(value))
    .map(([loc, value]) => [loc, cloneResponse(value as NonNullable<typeof value>)] as const);
  return Object.fromEntries(entries) as Record<Locale, NonNullable<LocalizationResolution['translation']>>;
}

async function fetchMealLogDetail(params: { userId: number; logId: string; locale: Locale }): Promise<MealLogDetail> {
  const rows = await sql<
    Array<{
      id: string;
      userId: number;
      foodItem: string;
      calories: number;
      proteinG: number;
      fatG: number;
      carbsG: number;
      mealPeriod: string | null;
      landingType: string | null;
      createdAt: Date;
      imageUrl: string | null;
      aiRaw: unknown;
      favoriteId: number | null;
    }>
  >`
    select
      ml."id",
      ml."userId",
      ml."foodItem",
      ml."calories",
      ml."proteinG",
      ml."fatG",
      ml."carbsG",
      ml."mealPeriod",
      ml."landingType",
      ml."createdAt",
      ml."imageUrl",
      ml."aiRaw",
      fm."id" as "favoriteId"
    from "MealLog" ml
    left join "FavoriteMeal" fm on fm."sourceMealLogId" = ml."id" and fm."userId" = ml."userId"
    where ml."id" = ${params.logId}
      and ml."userId" = ${params.userId}
      and ml."deletedAt" is null
    limit 1;
  `;

  const row = rows[0];
  if (!row) {
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const edits = await sql<
    Array<{
      id: number;
      createdAt: Date;
      userId: number;
      changes: Record<string, unknown> | null;
      userEmail: string | null;
      userName: string | null;
    }>
  >`
    select
      e."id",
      e."createdAt",
      e."userId",
      e."changes",
      u."email" as "userEmail",
      u."username" as "userName"
    from "MealLogEdit" e
    left join "User" u on u."id" = e."userId"
    where e."mealLogId" = ${params.logId}
    order by e."createdAt" desc;
  `;

  const periodHistory = await sql<
    Array<{
      id: number;
      previousMealPeriod: string | null;
      nextMealPeriod: string | null;
      source: string;
      createdAt: Date;
    }>
  >`
    select
      h."id",
      h."previousMealPeriod",
      h."nextMealPeriod",
      h."source",
      h."createdAt"
    from "MealLogPeriodHistory" h
    where h."mealLogId" = ${params.logId}
    order by h."createdAt" desc;
  `;

  const localization = resolveMealLogLocalization(row.aiRaw, params.locale);
  const translation = localization.translation;

  return {
    id: row.id,
    food_item: translation?.dish ?? row.foodItem,
    protein_g: row.proteinG,
    fat_g: row.fatG,
    carbs_g: row.carbsG,
    calories: row.calories,
    meal_period: toMealPeriodLabel(row.mealPeriod) ?? row.landingType ?? null,
    created_at: row.createdAt.toISOString(),
    image_url: row.imageUrl ?? null,
    ai_raw: buildAiRawPayload(localization),
    locale: localization.resolvedLocale,
    requested_locale: localization.requestedLocale,
    fallback_applied: localization.fallbackApplied,
    favorite_meal_id: row.favoriteId ?? null,
    history: edits.map((entry) => ({
      id: entry.id,
      created_at: entry.createdAt.toISOString(),
      user_id: entry.userId,
      user_email: entry.userEmail ?? null,
      user_name: entry.userName ?? null,
      changes: entry.changes ?? {},
    })),
    time_history: periodHistory.map((entry) => ({
      id: entry.id,
      previous: toMealPeriodLabel(entry.previousMealPeriod),
      next: toMealPeriodLabel(entry.nextMealPeriod),
      source: entry.source,
      changed_at: entry.createdAt.toISOString(),
    })),
  };
}

function mapUpdatePayload(body: UpdateMealLogRequest) {
  const toDbMealPeriod = (value: string | undefined) => (value ? value.toUpperCase() : undefined);
  return {
    foodItem: body.food_item,
    calories: body.calories,
    proteinG: body.protein_g,
    fatG: body.fat_g,
    carbsG: body.carbs_g,
    mealPeriod: toDbMealPeriod(body.meal_period),
  };
}

function buildUpdatedAiRaw(aiRaw: unknown, updates: ReturnType<typeof mapUpdatePayload>) {
  const parsed = parseMealLogAiRaw(aiRaw);
  if (parsed) {
    const baseLocale = parsed.locale ? normalizeLocale(parsed.locale) : DEFAULT_LOCALE;
    const baseSource =
      parsed.translations?.[baseLocale] ??
      parsed.translations?.[DEFAULT_LOCALE] ??
      cloneResponse(parsed as NonNullable<LocalizationResolution['translation']>);

    const updatedBase = cloneResponse(baseSource);
    if (typeof updates.foodItem === 'string') {
      updatedBase.dish = updates.foodItem;
    }
    updatedBase.totals = {
      ...updatedBase.totals,
      ...(typeof updates.calories === 'number' ? { kcal: updates.calories } : {}),
      ...(typeof updates.proteinG === 'number' ? { protein_g: updates.proteinG } : {}),
      ...(typeof updates.fatG === 'number' ? { fat_g: updates.fatG } : {}),
      ...(typeof updates.carbsG === 'number' ? { carbs_g: updates.carbsG } : {}),
    };

    const updatedTranslations = { ...(parsed.translations ?? {}) } as Record<Locale, NonNullable<LocalizationResolution['translation']>>;
    updatedTranslations[baseLocale] = updatedBase;

    return {
      ...parsed,
      dish: updatedBase.dish,
      totals: updatedBase.totals,
      items: updatedBase.items,
      warnings: updatedBase.warnings,
      translations: updatedTranslations,
    };
  }

  if (aiRaw) {
    const fallback = aiRaw as NonNullable<LocalizationResolution['translation']>;
    const updatedLegacy = {
      ...fallback,
      dish: typeof updates.foodItem === 'string' ? updates.foodItem : fallback.dish,
      totals: {
        ...fallback.totals,
        ...(typeof updates.calories === 'number' ? { kcal: updates.calories } : {}),
        ...(typeof updates.proteinG === 'number' ? { protein_g: updates.proteinG } : {}),
        ...(typeof updates.fatG === 'number' ? { fat_g: updates.fatG } : {}),
        ...(typeof updates.carbsG === 'number' ? { carbs_g: updates.carbsG } : {}),
      },
    };

    return {
      ...cloneResponse(updatedLegacy),
      locale: DEFAULT_LOCALE,
      translations: {
        [DEFAULT_LOCALE]: cloneResponse(updatedLegacy),
      },
    };
  }

  return aiRaw;
}

type ProcessMealLogParams = {
  userId: number;
  message: string;
  file?: File | undefined;
  idempotencyKey?: string;
  locale?: Locale;
  timezone?: string;
};

type ProcessMealLogResult = {
  ok: boolean;
  success: boolean;
  idempotent: boolean;
  idempotency_key: string;
  logId: string;
  requestLocale: Locale;
  locale: Locale;
  translations: Record<Locale, GeminiNutritionResponse>;
  fallbackApplied: boolean;
  dish: string;
  confidence: number;
  totals: GeminiNutritionResponse['totals'];
  items: GeminiNutritionResponse['items'];
  breakdown: {
    items: GeminiNutritionResponse['items'];
    warnings: string[];
  };
  meta: Record<string, unknown>;
  usage?: ReturnType<typeof summarizeUsageStatus>;
  favoriteCandidate: FavoriteMealDraft;
};

async function processMealLog(params: ProcessMealLogParams): Promise<ProcessMealLogResult> {
  const requestKey = params.idempotencyKey ?? buildRequestKey(params);
  const requestedLocale = normalizeLocale(params.locale);
  const timezone = normalizeTimezone(params.timezone);

  const existing = await sql<
    Array<{
      id: number;
      logId: string | null;
      aiRaw: unknown | null;
      mealLogId: string | null;
      requestKey: string;
    }>
  >`
    select ir."id", ir."logId", ml."aiRaw", ml."id" as "mealLogId", ir."requestKey"
    from "IngestRequest" ir
    left join "MealLog" ml on ml."id" = ir."logId"
    where ir."userId" = ${params.userId} and ir."requestKey" = ${requestKey}
    limit 1;
  `;

  if (existing[0]?.mealLogId) {
    const log = await fetchMealLogDetail({ userId: params.userId, logId: existing[0].mealLogId, locale: requestedLocale });
    return {
      ok: true,
      success: true,
      idempotent: true,
      idempotency_key: requestKey,
      logId: log.id,
      requestLocale: requestedLocale,
      locale: log.locale ?? requestedLocale,
      translations: buildTranslationMap(log.ai_raw),
      fallbackApplied: log.fallback_applied ?? false,
      dish: log.food_item,
      confidence: log.ai_raw?.confidence ?? 0.6,
      totals: log.ai_raw?.totals ?? {
        kcal: log.calories,
        protein_g: log.protein_g,
        fat_g: log.fat_g,
        carbs_g: log.carbs_g,
      },
      items: log.ai_raw?.items ?? [],
      breakdown: {
        items: log.ai_raw?.items ?? [],
        warnings: log.ai_raw?.warnings ?? [],
      },
      meta: {
        idempotent: true,
      },
      favoriteCandidate: buildFavoriteDraftFallback(log),
    };
  }

  const usageStatus = await evaluateAiUsage(params.userId);
  if (!usageStatus.allowed) {
    throw buildUsageLimitError(usageStatus);
  }

  const imageBase64 = params.file ? await fileToBase64(params.file) : undefined;
  const imageMimeType = params.file?.type;

  let ingestId: number | null = null;
  if (!existing[0]) {
    const inserted = await sql<{ id: number }[]>`
      insert into "IngestRequest" ("userId", "requestKey")
      values (${params.userId}, ${requestKey})
      returning "id";
    `;
    ingestId = inserted[0].id;
  } else {
    ingestId = existing[0].id;
  }

  const analysis = await analyzeMeal({
    message: params.message,
    imageBase64,
    imageMimeType,
    locale: requestedLocale,
  });

  const enrichedResponse: GeminiNutritionResponse = {
    ...analysis.response,
    meta: {
      ...(analysis.response.meta ?? {}),
      model: analysis.meta.model,
      attempt: analysis.meta.attempt,
      latencyMs: analysis.meta.latencyMs,
      attemptReports: analysis.attemptReports,
    },
  };

  const zeroFloored = Object.values(enrichedResponse.totals).some((value) => value === 0);
  const mealPeriod = inferMealPeriod(timezone);

  const seededTranslations: Record<Locale, GeminiNutritionResponse> = {
    [DEFAULT_LOCALE]: cloneResponse(enrichedResponse),
  };
  if (requestedLocale !== DEFAULT_LOCALE) {
    const localized = cloneResponse(enrichedResponse);
    seededTranslations[requestedLocale] = localized;
  }

  const aiPayload: GeminiNutritionResponse & { locale: Locale; translations: Record<Locale, GeminiNutritionResponse> } = {
    ...cloneResponse(enrichedResponse),
    locale: DEFAULT_LOCALE,
    translations: seededTranslations,
  };

  const localization = resolveMealLogLocalization(aiPayload, requestedLocale);
  const translation = localization.translation ?? cloneResponse(enrichedResponse);
  const responseTranslations = cloneTranslationsMap(localization.translations);
  const responseItems = translation.items ?? [];
  const warnings = [...(translation.warnings ?? [])];
  if (zeroFloored) {
    warnings.push('zeroFloored: AI が推定した栄養素の一部が 0 として返されました');
  }
  if (localization.fallbackApplied) {
    warnings.push(`translation_fallback:${localization.resolvedLocale}`);
  }

  const log = await withTransaction(async (tx) => {
    const createdRows = await tx<[{ id: string }]>`
      insert into "MealLog" (
        "userId",
        "foodItem",
        "calories",
        "proteinG",
        "fatG",
        "carbsG",
        "aiRaw",
        "zeroFloored",
        "guardrailNotes",
        "landingType",
        "mealPeriod"
      )
      values (
        ${params.userId},
        ${translation.dish ?? params.message},
        ${enrichedResponse.totals.kcal},
        ${enrichedResponse.totals.protein_g},
        ${enrichedResponse.totals.fat_g},
        ${enrichedResponse.totals.carbs_g},
        ${sql.json(aiPayload)},
        ${zeroFloored},
        ${zeroFloored ? 'zeroFloored' : null},
        ${enrichedResponse.landing_type ?? null},
        ${mealPeriod}
      )
      returning "id";
    `;

    const logId = createdRows[0].id;

    await tx`
      insert into "MealLogPeriodHistory" ("mealLogId", "previousMealPeriod", "nextMealPeriod", "source")
      values (${logId}, ${null}, ${mealPeriod}, 'auto');
    `;

    if (params.file && imageBase64) {
      const imageUrl = `data:${params.file.type};base64,${imageBase64}`;
      await tx`
        insert into "MediaAsset" ("mealLogId", "mimeType", "url", "sizeBytes")
        values (${logId}, ${params.file.type}, ${imageUrl}, ${params.file.size});
      `;
      await tx`
        update "MealLog" set "imageUrl" = ${imageUrl} where "id" = ${logId};
      `;
    }

    if (ingestId) {
      await tx`
        update "IngestRequest"
        set "logId" = ${zeroFloored ? null : logId}
        where "id" = ${ingestId};
      `;
    }

    return logId;
  });

  const usageSummary = await recordAiUsage({
    userId: params.userId,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });

  const meta: Record<string, unknown> = {
    ...(enrichedResponse.meta ?? {}),
    imageUrl: params.file ? `data:${params.file.type};base64,${imageBase64 ?? ''}` : null,
    fallback_model_used: analysis.meta.model === 'models/gemini-2.5-pro',
    mealPeriod,
    timezone,
    localization: buildLocalizationMeta({ ...localization, translations: responseTranslations }),
  };

  const favoriteCandidate = buildFavoriteDraftPayload({
    translation,
    totals: translation.totals,
    items: responseItems,
    fallbackDish: translation.dish ?? params.message,
    sourceMealLogId: log,
  });

  return {
    ok: true,
    success: true,
    idempotent: false,
    idempotency_key: requestKey,
    logId: log,
    requestLocale: localization.requestedLocale,
    locale: localization.resolvedLocale,
    translations: responseTranslations,
    fallbackApplied: localization.fallbackApplied,
    dish: translation.dish ?? params.message,
    confidence: translation.confidence ?? 0.6,
    totals: translation.totals,
    items: responseItems,
    breakdown: {
      items: responseItems,
      warnings,
    },
    meta,
    usage: summarizeUsageStatus(usageStatus, usageStatus.consumeCredit),
    favoriteCandidate,
  };
}

function buildLocalizationMeta(localization: LocalizationResolution) {
  return {
    requested: localization.requestedLocale,
    resolved: localization.resolvedLocale,
    fallbackApplied: localization.fallbackApplied,
    available: Object.keys(localization.translations),
  } satisfies Record<string, unknown>;
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildRequestKey(params: ProcessMealLogParams) {
  const hashString = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${Date.now()}-${params.userId}-${hashString}`;
}

function inferMealPeriod(timezone: string | undefined, referenceDate: Date | undefined = undefined): string {
  const zone = normalizeTimezone(timezone);
  const dt = referenceDate ? DateTime.fromJSDate(referenceDate).setZone(zone) : DateTime.now().setZone(zone);
  const hour = dt.hour;
  if (hour >= 5 && hour < 10) return 'BREAKFAST';
  if (hour >= 10 && hour < 15) return 'LUNCH';
  if (hour >= 15 && hour < 21) return 'DINNER';
  return 'SNACK';
}

function cloneTranslationsMap(translations: Record<Locale, GeminiNutritionResponse>) {
  const entries = Object.entries(translations).map(([locale, value]) => [locale, cloneResponse(value)] as const);
  return Object.fromEntries(entries) as Record<Locale, GeminiNutritionResponse>;
}

function buildFavoriteDraftPayload(params: {
  translation: GeminiNutritionResponse | null;
  totals: GeminiNutritionResponse['totals'];
  items: GeminiNutritionResponse['items'];
  fallbackDish: string;
  sourceMealLogId?: string;
}): FavoriteMealDraft {
  const baseResponse: GeminiNutritionResponse = params.translation
    ? params.translation
    : {
        dish: params.fallbackDish,
        confidence: 0.6,
        totals: params.totals,
        items: params.items,
        warnings: [],
        landing_type: null,
        meta: undefined,
      };

  const draft: FavoriteMealDraft = {
    name: baseResponse.dish,
    notes: null,
    totals: baseResponse.totals,
    items: (baseResponse.items ?? []).map((item, index) => ({
      name: item.name,
      grams: item.grams,
      calories: null,
      protein_g: item.protein_g ?? null,
      fat_g: item.fat_g ?? null,
      carbs_g: item.carbs_g ?? null,
      order_index: index,
    })),
    source_log_id: params.sourceMealLogId ?? null,
  };
  return draft;
}

function buildFavoriteDraftFallback(log: MealLogDetail): FavoriteMealDraft {
  return {
    name: log.food_item,
    notes: null,
    totals: {
      kcal: log.calories,
      protein_g: log.protein_g,
      fat_g: log.fat_g,
      carbs_g: log.carbs_g,
    },
    items: log.ai_raw?.items?.map((item, index) => ({
      name: item.name,
      grams: item.grams,
      calories: null,
      protein_g: item.protein_g ?? null,
      fat_g: item.fat_g ?? null,
      carbs_g: item.carbs_g ?? null,
      order_index: index,
    })) ?? [],
    source_log_id: log.id,
  };
}

function buildTranslationMap(aiRaw: unknown) {
  const parsed = parseMealLogAiRaw(aiRaw);
  if (parsed?.translations) {
    return cloneTranslationsMap(parsed.translations as Record<Locale, GeminiNutritionResponse>);
  }
  return {};
}

function normalizeDraft(draft: FavoriteMealDraft): FavoriteMealDraft {
  FavoriteMealCreateRequestSchema.parse(draft);
  const items = draft.items.map((item, idx) => ({
    ...item,
    order_index: item.order_index ?? idx,
  }));
  return {
    ...draft,
    items,
    notes: draft.notes ?? null,
    source_log_id: draft.source_log_id ?? null,
  };
}

function resolveTotals(payload: Partial<FavoriteMealDraft>, existing: FavoriteMeal) {
  if (payload.totals) {
    return payload.totals;
  }
  if (payload.items) {
    const computed = computeTotalsFromItems(payload.items);
    if (computed) {
      return computed;
    }
  }
  return existing.totals;
}

function computeTotalsFromItems(items: FavoriteMealDraft['items']) {
  if (!items.length) return null;
  let calories = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  for (const item of items) {
    if (
      typeof item.calories !== 'number' ||
      typeof item.protein_g !== 'number' ||
      typeof item.fat_g !== 'number' ||
      typeof item.carbs_g !== 'number'
    ) {
      return null;
    }
    calories += item.calories;
    protein += item.protein_g;
    fat += item.fat_g;
    carbs += item.carbs_g;
  }
  return {
    kcal: calories,
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
  };
}

async function createFavoriteMeal(userId: number, payload: unknown): Promise<FavoriteMeal> {
  const parsed = FavoriteMealCreateRequestSchema.parse(payload);
  const normalized = normalizeDraft(parsed);

  const created = await withTransaction(async (tx) => {
    const mealRows = await tx<[{ id: number }]>`
      insert into "FavoriteMeal" (
        "userId", "sourceMealLogId", "name", "notes", "calories", "proteinG", "fatG", "carbsG"
      )
      values (
        ${userId},
        ${normalized.source_log_id},
        ${normalized.name},
        ${normalized.notes ?? null},
        ${normalized.totals.kcal},
        ${normalized.totals.protein_g},
        ${normalized.totals.fat_g},
        ${normalized.totals.carbs_g}
      )
      returning "id";
    `;
    const favoriteId = mealRows[0].id;

    if (normalized.items.length > 0) {
      await tx`
        insert into "FavoriteMealItem" ("favoriteMealId", "name", "grams", "calories", "proteinG", "fatG", "carbsG", "orderIndex")
        values ${sql.join(
          normalized.items.map((item, idx) => sql`(${favoriteId}, ${item.name}, ${item.grams}, ${item.calories ?? null}, ${item.protein_g ?? null}, ${item.fat_g ?? null}, ${item.carbs_g ?? null}, ${item.order_index ?? idx})`),
          sql`, `,
        )};
      `;
    }

    return favoriteId;
  });

  return getFavoriteMeal(userId, created);
}

async function listFavoriteMeals(userId: number): Promise<FavoriteMeal[]> {
  const favorites = await sql<
    Array<{
      id: number;
      name: string;
      notes: string | null;
      calories: number;
      proteinG: number;
      fatG: number;
      carbsG: number;
      sourceMealLogId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >`
    select "id", "name", "notes", "calories", "proteinG", "fatG", "carbsG", "sourceMealLogId", "createdAt", "updatedAt"
    from "FavoriteMeal"
    where "userId" = ${userId}
    order by "createdAt" desc;
  `;

  if (favorites.length === 0) return [];

  const items = await sql<
    Array<{
      id: number;
      favoriteMealId: number;
      name: string;
      grams: number;
      calories: number | null;
      proteinG: number | null;
      fatG: number | null;
      carbsG: number | null;
      orderIndex: number;
    }>
  >`
    select "id", "favoriteMealId", "name", "grams", "calories", "proteinG", "fatG", "carbsG", "orderIndex"
    from "FavoriteMealItem"
    where "favoriteMealId" in (${sql.join(favorites.map((f) => f.id), sql`, `)})
    order by "orderIndex" asc, "id" asc;
  `;

  const itemsByFavorite = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByFavorite.get(item.favoriteMealId) ?? [];
    list.push(item);
    itemsByFavorite.set(item.favoriteMealId, list);
  }

  return favorites.map((fav) => mapFavoriteMeal(fav, itemsByFavorite.get(fav.id) ?? []));
}

async function getFavoriteMeal(userId: number, favoriteId: number): Promise<FavoriteMeal> {
  const favorites = await sql<
    Array<{
      id: number;
      name: string;
      notes: string | null;
      calories: number;
      proteinG: number;
      fatG: number;
      carbsG: number;
      sourceMealLogId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >`
    select "id", "name", "notes", "calories", "proteinG", "fatG", "carbsG", "sourceMealLogId", "createdAt", "updatedAt"
    from "FavoriteMeal"
    where "id" = ${favoriteId} and "userId" = ${userId}
    limit 1;
  `;

  const favorite = favorites[0];
  if (!favorite) {
    throw new HttpError('お気に入りが見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const items = await sql<
    Array<{
      id: number;
      favoriteMealId: number;
      name: string;
      grams: number;
      calories: number | null;
      proteinG: number | null;
      fatG: number | null;
      carbsG: number | null;
      orderIndex: number;
    }>
  >`
    select "id", "favoriteMealId", "name", "grams", "calories", "proteinG", "fatG", "carbsG", "orderIndex"
    from "FavoriteMealItem"
    where "favoriteMealId" = ${favoriteId}
    order by "orderIndex" asc, "id" asc;
  `;

  return mapFavoriteMeal(favorite, items);
}

async function updateFavoriteMeal(userId: number, favoriteId: number, payload: unknown): Promise<FavoriteMeal> {
  const parsed = FavoriteMealUpdateRequestSchema.parse(payload);
  const existing = await getFavoriteMeal(userId, favoriteId);

  const totals = resolveTotals(parsed, existing);

  await withTransaction(async (tx) => {
    await tx`
      update "FavoriteMeal"
      set
        "name" = ${parsed.name ?? existing.name},
        "notes" = ${parsed.notes ?? existing.notes},
        "sourceMealLogId" = ${parsed.source_log_id ?? existing.source_log_id},
        "calories" = ${totals.kcal},
        "proteinG" = ${totals.protein_g},
        "fatG" = ${totals.fat_g},
        "carbsG" = ${totals.carbs_g},
        "updatedAt" = now()
      where "id" = ${favoriteId} and "userId" = ${userId};
    `;

    if (Array.isArray(parsed.items)) {
      await tx`delete from "FavoriteMealItem" where "favoriteMealId" = ${favoriteId};`;
      if (parsed.items.length > 0) {
        await tx`
          insert into "FavoriteMealItem" ("favoriteMealId", "name", "grams", "calories", "proteinG", "fatG", "carbsG", "orderIndex")
          values ${sql.join(
            parsed.items.map((item, idx) => sql`(${favoriteId}, ${item.name}, ${item.grams}, ${item.calories ?? null}, ${item.protein_g ?? null}, ${item.fat_g ?? null}, ${item.carbs_g ?? null}, ${item.order_index ?? idx})`),
            sql`, `,
          )};
        `;
      }
    }
  });

  return getFavoriteMeal(userId, favoriteId);
}

async function deleteFavoriteMeal(userId: number, favoriteId: number): Promise<void> {
  const result = await sql<{ id: number }[]>`
    delete from "FavoriteMeal" where "id" = ${favoriteId} and "userId" = ${userId} returning "id";
  `;
  if (result.length === 0) {
    throw new HttpError('お気に入りが見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }
}

async function logFavoriteMeal(userId: number, favoriteId: number) {
  const favorite = await getFavoriteMeal(userId, favoriteId);
  const baseResponse = favoriteToGeminiResponse(favorite);

  const aiPayload = {
    ...baseResponse,
    locale: DEFAULT_LOCALE,
    translations: { [DEFAULT_LOCALE]: cloneResponse(baseResponse) },
  };

  const logId = await withTransaction(async (tx) => {
    const createdRows = await tx<[{ id: string }]>`
      insert into "MealLog" ("userId", "foodItem", "calories", "proteinG", "fatG", "carbsG", "aiRaw", "zeroFloored", "guardrailNotes", "landingType")
      values (${userId}, ${baseResponse.dish}, ${baseResponse.totals.kcal}, ${baseResponse.totals.protein_g}, ${baseResponse.totals.fat_g}, ${baseResponse.totals.carbs_g}, ${sql.json(aiPayload)}, ${false}, ${null}, ${baseResponse.landing_type ?? null})
      returning "id";
    `;
    const newLogId = createdRows[0].id;
    await tx`
      insert into "MealLogPeriodHistory" ("mealLogId", "previousMealPeriod", "nextMealPeriod", "source")
      values (${newLogId}, ${null}, ${null}, 'favorite');
    `;
    return newLogId;
  });

  const localization = resolveMealLogLocalization(aiPayload, DEFAULT_LOCALE);
  const translations = cloneTranslationsMap(localization.translations);
  const translation = localization.translation ?? baseResponse;
  const favoriteDraft = buildFavoriteDraftPayload({
    translation,
    totals: translation.totals,
    items: translation.items,
    fallbackDish: translation.dish,
    sourceMealLogId: logId,
  });

  return {
    ok: true,
    success: true,
    idempotent: false,
    idempotency_key: `favorite-${favoriteId}-${Date.now()}`,
    logId,
    requestLocale: localization.requestedLocale,
    locale: localization.resolvedLocale,
    translations,
    fallbackApplied: localization.fallbackApplied,
    dish: translation.dish,
    confidence: translation.confidence,
    totals: translation.totals,
    items: translation.items,
    breakdown: {
      items: translation.items,
      warnings: translation.warnings ?? [],
    },
    meta: {
      favoriteId,
      localization: buildLocalizationMeta(localization),
      created_from_favorite: true,
    } satisfies Record<string, unknown>,
    usage: undefined,
    favoriteCandidate: favoriteDraft,
  } as const;
}

function mapFavoriteMeal(
  favorite: {
    id: number;
    name: string;
    notes: string | null;
    calories: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
    sourceMealLogId: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  items: Array<{
    id: number;
    favoriteMealId: number;
    name: string;
    grams: number;
    calories: number | null;
    proteinG: number | null;
    fatG: number | null;
    carbsG: number | null;
    orderIndex: number;
  }>,
): FavoriteMeal {
  return {
    id: favorite.id,
    name: favorite.name,
    notes: favorite.notes,
    totals: {
      kcal: favorite.calories,
      protein_g: favorite.proteinG,
      fat_g: favorite.fatG,
      carbs_g: favorite.carbsG,
    },
    source_log_id: favorite.sourceMealLogId,
    items: items
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        id: item.id,
        name: item.name,
        grams: item.grams,
        calories: item.calories,
        protein_g: item.proteinG,
        fat_g: item.fatG,
        carbs_g: item.carbsG,
        order_index: item.orderIndex,
      })),
    created_at: favorite.createdAt.toISOString(),
    updated_at: favorite.updatedAt.toISOString(),
  };
}

function favoriteToGeminiResponse(favorite: FavoriteMeal): GeminiNutritionResponse {
  return {
    dish: favorite.name,
    confidence: 0.95,
    totals: favorite.totals,
    items: favorite.items.map((item) => ({
      name: item.name,
      grams: item.grams,
      protein_g: item.protein_g ?? undefined,
      fat_g: item.fat_g ?? undefined,
      carbs_g: item.carbs_g ?? undefined,
    })),
    warnings: [],
    landing_type: null,
    meta: { favoriteId: favorite.id },
  };
}

async function getDashboardSummary(params: { userId: number; period: string; from?: string; to?: string }) {
  const { range } = resolveRangeWithCustom(params.period, DASHBOARD_TIMEZONE, params.from, params.to);

  const logs = await sql<
    Array<{
      createdAt: Date;
      calories: number;
      proteinG: number;
      fatG: number;
      carbsG: number;
      mealPeriod: string | null;
    }>
  >`
    select "createdAt", "calories", "proteinG", "fatG", "carbsG", "mealPeriod"
    from "MealLog"
    where "userId" = ${params.userId}
      and "deletedAt" is null
      and "createdAt" >= ${range.fromDate.toJSDate()}
      and "createdAt" < ${range.toDate.toJSDate()};
  `;

  const todayTotals = await fetchTodayTotals(params.userId, DASHBOARD_TIMEZONE);
  const dailyTargets = await resolveUserTargets(params.userId);
  const summary = buildDashboardSummary({
    logs,
    range,
    timezone: DASHBOARD_TIMEZONE,
    todayTotals,
    dailyTargets,
  });

  return {
    ...summary,
    metadata: {
      generatedAt: DateTime.now().setZone(DASHBOARD_TIMEZONE).toISO(),
    },
  };
}

async function resolveUserTargets(userId: number) {
  const rows = await sql<
    Array<{
      targetCalories: number | null;
      targetProteinG: number | null;
      targetFatG: number | null;
      targetCarbsG: number | null;
    }>
  >`
    select "targetCalories", "targetProteinG", "targetFatG", "targetCarbsG"
    from "UserProfile"
    where "userId" = ${userId}
    limit 1;
  `;

  const defaults = getDefaultTargets();
  const profile = rows[0];
  if (!profile) return defaults;

  const normalize = (value: number | null | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

  return {
    calories: normalize(profile.targetCalories, defaults.calories),
    protein_g: normalize(profile.targetProteinG, defaults.protein_g),
    fat_g: normalize(profile.targetFatG, defaults.fat_g),
    carbs_g: normalize(profile.targetCarbsG, defaults.carbs_g),
  };
}

async function fetchTodayTotals(userId: number, timezone: string) {
  const { fromDate, toDate } = resolveSingleDayRange('today', timezone);
  const rows = await sql<
    Array<{
      calories: number | null;
      proteinG: number | null;
      fatG: number | null;
      carbsG: number | null;
    }>
  >`
    select
      coalesce(sum("calories"), 0) as "calories",
      coalesce(sum("proteinG"), 0) as "proteinG",
      coalesce(sum("fatG"), 0) as "fatG",
      coalesce(sum("carbsG"), 0) as "carbsG"
    from "MealLog"
    where "userId" = ${userId}
      and "deletedAt" is null
      and "createdAt" >= ${fromDate.toJSDate()}
      and "createdAt" < ${toDate.toJSDate()};
  `;

  const totals = rows[0] ?? { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  return {
    calories: totals.calories ?? 0,
    protein_g: totals.proteinG ?? 0,
    fat_g: totals.fatG ?? 0,
    carbs_g: totals.carbsG ?? 0,
  };
}

function resolveRangeWithCustom(period: string, timezone: string, from?: string, to?: string) {
  switch (period) {
    case 'today':
    case 'yesterday':
      return { range: resolveSingleDayRange(period, timezone) };
    case 'thisWeek':
    case 'lastWeek':
      return { range: resolveWeekRange(period, timezone) };
    case 'custom': {
      if (!from || !to) throw new HttpError('カスタム期間にはfrom/toが必要です', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
      const fromDate = DateTime.fromISO(from, { zone: timezone }).startOf('day');
      const toDate = DateTime.fromISO(to, { zone: timezone }).plus({ days: 1 }).startOf('day');
      if (!fromDate.isValid || !toDate.isValid) {
        throw new HttpError('日付形式が正しくありません', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
      }
      if (toDate <= fromDate) {
        throw new HttpError('終了日は開始日より後の日付にしてください', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
      }
      if (toDate.diff(fromDate, 'days').days > 31) {
        throw new HttpError('カスタム期間は31日以内で指定してください', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
      }
      return { range: { fromDate, toDate, period } };
    }
    default:
      throw new HttpError(`未対応の期間です: ${period}`, { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
}

function resolveSingleDayRange(period: string, timezone: string) {
  const now = DateTime.now().setZone(timezone);
  const base = period === 'today' ? now : now.minus({ days: 1 });
  return {
    fromDate: base.startOf('day'),
    toDate: base.plus({ days: 1 }).startOf('day'),
    period,
  };
}

function resolveWeekRange(period: string, timezone: string) {
  const now = DateTime.now().setZone(timezone);
  const startOfThisWeek = now.startOf('week');
  const fromDate = period === 'thisWeek' ? startOfThisWeek : startOfThisWeek.minus({ weeks: 1 });
  const toDate = fromDate.plus({ weeks: 1 });
  return {
    fromDate,
    toDate,
    period,
  };
}

function buildDashboardSummary({
  logs,
  range,
  timezone,
  todayTotals,
  dailyTargets,
}: {
  logs: Array<{ createdAt: Date; calories: number; proteinG: number; fatG: number; carbsG: number; mealPeriod: string | null }>;
  range: { fromDate: DateTime; toDate: DateTime; period: string };
  timezone: string;
  todayTotals: { calories: number; protein_g: number; fat_g: number; carbs_g: number };
  dailyTargets: { calories: number; protein_g: number; fat_g: number; carbs_g: number };
}) {
  const fromDate = range.fromDate;
  const toDate = range.toDate;
  const days: DateTime[] = [];
  let cursor = fromDate;
  while (cursor < toDate) {
    days.push(cursor);
    cursor = cursor.plus({ days: 1 });
  }

  const byDate = new Map<string, { total: number; perMealPeriod: Record<string, number> }>();
  const totals = { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

  for (const log of logs) {
    const dt = DateTime.fromJSDate(log.createdAt, { zone: timezone });
    const key = dt.setZone(timezone).startOf('day').toISODate();
    if (!key) continue;
    const bucket = byDate.get(key) ?? createEmptyDailyBucket();
    bucket.total += log.calories;
    const mealPeriodKey = (log.mealPeriod?.toLowerCase?.() ?? 'unknown');
    if (!Object.prototype.hasOwnProperty.call(bucket.perMealPeriod, mealPeriodKey)) {
      bucket.perMealPeriod.unknown += log.calories;
    } else {
      bucket.perMealPeriod[mealPeriodKey] += log.calories;
    }
    byDate.set(key, bucket);

    totals.calories += log.calories;
    totals.protein_g += log.proteinG;
    totals.fat_g += log.fatG;
    totals.carbs_g += log.carbsG;
  }

  const dailyEntries = days.map((day, idx) => {
    const key = day.setZone(timezone).startOf('day').toISODate() ?? day.toFormat('yyyy-MM-dd');
    const bucket = byDate.get(key) ?? createEmptyDailyBucket();
    return {
      date: key,
      total: round(bucket.total, DASHBOARD_TARGETS.calories.decimals),
      perMealPeriod: mapMealPeriod(bucket.perMealPeriod),
    };
  });

  const roundedTotals = roundMacros(totals);
  const safeDailyTargets = sanitizeDailyTargets(dailyTargets ?? getDefaultTargets());
  const daysCount = Math.max(dailyEntries.length, 1);
  const scaledTargets = scaleTargets(safeDailyTargets, daysCount);
  const targets = roundMacros(scaledTargets);
  const delta = roundMacros({
    calories: roundedTotals.calories - targets.calories,
    protein_g: roundedTotals.protein_g - targets.protein_g,
    fat_g: roundedTotals.fat_g - targets.fat_g,
    carbs_g: roundedTotals.carbs_g - targets.carbs_g,
  });

  const micros = buildMicros(roundedTotals, targets, delta);
  const remainingToday = roundMacros({
    calories: Math.max(safeDailyTargets.calories - todayTotals.calories, 0),
    protein_g: Math.max(safeDailyTargets.protein_g - todayTotals.protein_g, 0),
    fat_g: Math.max(safeDailyTargets.fat_g - todayTotals.fat_g, 0),
    carbs_g: Math.max(safeDailyTargets.carbs_g - todayTotals.carbs_g, 0),
  });

  return {
    period: range.period,
    range: {
      from: fromDate.toISO(),
      to: toDate.toISO(),
      timezone,
    },
    calories: {
      daily: dailyEntries,
      remainingToday,
    },
    macros: {
      total: roundedTotals,
      targets,
      delta,
    },
    micros,
  };
}

function sanitizeDailyTargets(targets: { calories: number; protein_g: number; fat_g: number; carbs_g: number }) {
  const defaults = getDefaultTargets();
  return {
    calories: targets.calories > 0 ? targets.calories : defaults.calories,
    protein_g: targets.protein_g > 0 ? targets.protein_g : defaults.protein_g,
    fat_g: targets.fat_g > 0 ? targets.fat_g : defaults.fat_g,
    carbs_g: targets.carbs_g > 0 ? targets.carbs_g : defaults.carbs_g,
  };
}

function getDefaultTargets() {
  return {
    calories: DASHBOARD_TARGETS.calories.value,
    protein_g: DASHBOARD_TARGETS.protein_g.value,
    fat_g: DASHBOARD_TARGETS.fat_g.value,
    carbs_g: DASHBOARD_TARGETS.carbs_g.value,
  };
}

function scaleTargets(base: { calories: number; protein_g: number; fat_g: number; carbs_g: number }, multiplier: number) {
  return {
    calories: base.calories * multiplier,
    protein_g: base.protein_g * multiplier,
    fat_g: base.fat_g * multiplier,
    carbs_g: base.carbs_g * multiplier,
  };
}

function round(value: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function roundMacros(macros: { calories: number; protein_g: number; fat_g: number; carbs_g: number }) {
  return {
    calories: round(macros.calories, DASHBOARD_TARGETS.calories.decimals),
    protein_g: round(macros.protein_g, DASHBOARD_TARGETS.protein_g.decimals),
    fat_g: round(macros.fat_g, DASHBOARD_TARGETS.fat_g.decimals),
    carbs_g: round(macros.carbs_g, DASHBOARD_TARGETS.carbs_g.decimals),
  };
}

function buildMicros(total: { calories: number; protein_g: number; fat_g: number; carbs_g: number }, targets: { calories: number; protein_g: number; fat_g: number; carbs_g: number }, delta: { calories: number; protein_g: number; fat_g: number; carbs_g: number }) {
  return [
    {
      key: 'calories',
      label: 'カロリー',
      unit: DASHBOARD_TARGETS.calories.unit,
      total: total.calories,
      target: targets.calories,
      delta: delta.calories,
    },
    {
      key: 'protein_g',
      label: 'たんぱく質',
      unit: DASHBOARD_TARGETS.protein_g.unit,
      total: total.protein_g,
      target: targets.protein_g,
      delta: delta.protein_g,
    },
    {
      key: 'fat_g',
      label: '脂質',
      unit: DASHBOARD_TARGETS.fat_g.unit,
      total: total.fat_g,
      target: targets.fat_g,
      delta: delta.fat_g,
    },
    {
      key: 'carbs_g',
      label: '炭水化物',
      unit: DASHBOARD_TARGETS.carbs_g.unit,
      total: total.carbs_g,
      target: targets.carbs_g,
      delta: delta.carbs_g,
    },
  ];
}

function mapMealPeriod(periods: Record<string, number>) {
  return {
    breakfast: round(periods.breakfast ?? 0, 0),
    lunch: round(periods.lunch ?? 0, 0),
    dinner: round(periods.dinner ?? 0, 0),
    snack: round(periods.snack ?? 0, 0),
    unknown: round(periods.unknown ?? 0, 0),
  };
}

function createEmptyDailyBucket() {
  return {
    total: 0,
    perMealPeriod: {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snack: 0,
      unknown: 0,
    },
  };
}

async function buildCalorieTrend(params: { userId: number; mode: 'daily' | 'weekly' | 'monthly'; locale?: string }) {
  const timezone = DASHBOARD_TIMEZONE;
  const now = DateTime.now().setZone(timezone);
  const { startInclusive, endExclusive } = resolveTrendRange(now, params.mode);

  const rows = await sql<
    Array<{
      createdAt: Date;
      calories: number;
    }>
  >`
    select "createdAt", "calories"
    from "MealLog"
    where "userId" = ${params.userId}
      and "deletedAt" is null
      and "createdAt" >= ${startInclusive.toJSDate()}
      and "createdAt" < ${endExclusive.toJSDate()};
  `;

  const bucket = new Map<string, number>();
  for (const log of rows) {
    const dt = DateTime.fromJSDate(log.createdAt, { zone: timezone });
    if (!dt.isValid) continue;
    const key = dt.startOf('day').toISODate();
    if (!key) continue;
    bucket.set(key, (bucket.get(key) ?? 0) + (log.calories ?? 0));
  }

  const points: Array<{ date: string; label: string; value: number }> = [];
  const totalDays = Math.max(1, Math.round(endExclusive.diff(startInclusive, 'days').days));
  for (let offset = 0; offset < totalDays; offset += 1) {
    const current = startInclusive.plus({ days: offset });
    const key = current.toISODate() ?? current.toFormat('yyyy-MM-dd');
    const value = Math.round(bucket.get(key) ?? 0);
    points.push({
      date: key,
      label: formatTrendLabel(current, params.locale),
      value,
    });
  }

  const targets = await resolveUserTargets(params.userId);
  return {
    target: targets.calories ?? DASHBOARD_TARGETS.calories.value,
    points,
  };
}

function resolveTrendRange(now: DateTime, mode: 'daily' | 'weekly' | 'monthly') {
  const base = now;
  switch (mode) {
    case 'daily': {
      const daysFromSunday = base.weekday % 7;
      const startInclusive = base.minus({ days: daysFromSunday }).startOf('day');
      const endExclusive = startInclusive.plus({ days: 7 });
      return { startInclusive, endExclusive };
    }
    case 'weekly': {
      const endExclusive = base.plus({ days: 1 }).startOf('day');
      const startInclusive = endExclusive.minus({ days: 7 });
      return { startInclusive, endExclusive };
    }
    case 'monthly':
    default: {
      const startInclusive = base.startOf('month');
      const endExclusive = startInclusive.plus({ months: 1 });
      return { startInclusive, endExclusive };
    }
  }
}

function formatTrendLabel(dateTime: DateTime, locale?: string) {
  const targetLocale = locale ?? 'ja-JP';
  const timeZone = dateTime.zoneName ?? 'UTC';
  const jsDate = dateTime.toJSDate();
  const monthDayFormatter = new Intl.DateTimeFormat(targetLocale, { month: 'numeric', day: 'numeric', timeZone });
  const weekdayFormatter = new Intl.DateTimeFormat(targetLocale, { weekday: 'short', timeZone });
  const monthDay = monthDayFormatter.format(jsDate);
  const weekday = weekdayFormatter.format(jsDate);
  return `${monthDay} (${weekday})`;
}

async function getUserStreak(userId: number) {
  const rows = await sql<{ createdAt: Date }[]>`
    select "createdAt" from "MealLog"
    where "userId" = ${userId} and "deletedAt" is null
    order by "createdAt" desc;
  `;

  if (!rows.length) {
    return { current: 0, longest: 0, lastLoggedAt: null };
  }

  const timezone = DASHBOARD_TIMEZONE;
  const uniqueDays: DateTime[] = [];
  let lastKey: string | null = null;
  for (const log of rows) {
    const day = DateTime.fromJSDate(log.createdAt, { zone: 'utc' }).setZone(timezone).startOf('day');
    const key = day.toISODate();
    if (key !== lastKey) {
      uniqueDays.push(day);
      lastKey = key;
    }
  }

  if (!uniqueDays.length) {
    return { current: 0, longest: 0, lastLoggedAt: null };
  }

  const lastLoggedAt = uniqueDays[0].toISO();

  const longest = calculateLongestStreak(uniqueDays);
  const current = calculateCurrentStreak(uniqueDays, timezone);

  return { current, longest, lastLoggedAt };
}

function calculateLongestStreak(days: DateTime[]) {
  let longest = 0;
  let run = 0;
  let prev: DateTime | null = null;

  for (const day of days) {
    if (!prev) {
      run = 1;
    } else {
      const diff = Math.round(prev.diff(day, 'days').days);
      run = diff === 1 ? run + 1 : 1;
    }
    prev = day;
    if (run > longest) {
      longest = run;
    }
  }

  return longest;
}

function calculateCurrentStreak(days: DateTime[], timezone: string) {
  const now = DateTime.now().setZone(timezone).startOf('day');
  let expected = now;
  let streak = 0;

  for (const day of days) {
    const diff = Math.round(expected.diff(day, 'days').days);

    if (diff === 0) {
      streak += 1;
      expected = expected.minus({ days: 1 });
      continue;
    }

    if (streak === 0 && diff === 1) {
      streak = 1;
      expected = day.minus({ days: 1 });
      continue;
    }

    break;
  }

  return streak;
}

async function analyzeMeal(params: { message: string; imageBase64?: string; imageMimeType?: string; locale?: Locale }) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    const mock = buildMockResponse(params.message, params.locale ?? DEFAULT_LOCALE);
    const meta = { model: 'mock', attempt: 1, latencyMs: 10, rawText: JSON.stringify(mock) };
    return { response: mock, attemptReports: [{ model: 'mock', ok: true, latencyMs: meta.latencyMs, attempt: 1 }], meta };
  }

  const primaryModel = 'models/gemini-2.5-flash';
  const fallbackModel = 'models/gemini-2.5-pro';

  const attempt = async (model: string) => {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`);
    url.searchParams.set('key', apiKey);
    const prompt = buildPrompt(params.message, params.locale ?? DEFAULT_LOCALE);

    const requestBody: Record<string, unknown> = {
      contents: [
        {
          parts: [
            ...(params.imageBase64 && params.imageMimeType
              ? [
                  {
                    inline_data: {
                      mime_type: params.imageMimeType,
                      data: params.imageBase64,
                    },
                  },
                ]
              : []),
            { text: prompt },
          ],
          role: 'user',
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 32,
        topP: 0.8,
        responseMimeType: 'application/json',
      },
    };

    const started = Date.now();
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Gemini error ${resp.status}: ${text}`);
    }
    const data = JSON.parse(text) as any;
    const first = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!first) {
      throw new Error('Gemini returned no content');
    }
    const parsed = GeminiNutritionResponseSchema.parse(JSON.parse(first));
    const latencyMs = Date.now() - started;
    return {
      response: parsed,
      attemptReports: [{ model, ok: true, latencyMs, attempt: 1 }],
      meta: { model, attempt: 1, latencyMs, rawText: first },
    };
  };

  try {
    return await attempt(primaryModel);
  } catch (_error) {
    const fallback = await attempt(fallbackModel);
    fallback.response.meta = { ...(fallback.response.meta ?? {}), fallback_model_used: true };
    return fallback;
  }
}

async function parseMultipart(c: Context) {
  const form = await c.req.parseBody();
  const message = typeof form['message'] === 'string' ? form['message'].trim() : '';
  const file = form['image'] instanceof File ? (form['image'] as File) : undefined;
  return { message, file };
}

function buildPrompt(userMessage: string, locale: Locale = DEFAULT_LOCALE) {
  return `You are a nutrition analyst. Analyze the following meal description and respond ONLY with a JSON object that matches this TypeScript type: {
  "dish": string,
  "confidence": number between 0 and 1,
  "totals": { "kcal": number, "protein_g": number, "fat_g": number, "carbs_g": number },
  "items": Array<{ "name": string, "grams": number, "protein_g"?: number, "fat_g"?: number, "carbs_g"?: number }>,
  "warnings"?: string[],
  "landing_type"?: string | null,
  "meta"?: { "model": string, "fallback_model_used"?: boolean }
}.
Numbers must be floats, never strings. Calories must be > 0 when meal is realistic. Use realistic default assumptions if unspecified. The end-user locale is ${locale}; consider locale-specific context but keep all text fields in English (United States).
User description: ${userMessage}`;
}

function buildMockResponse(message: string, locale: Locale): GeminiNutritionResponse {
  const baseCalories = Math.max(200, Math.min(900, message.length * 15));
  const totals = {
    kcal: baseCalories,
    protein_g: Math.round(baseCalories * 0.25) / 10,
    fat_g: Math.round(baseCalories * 0.3) / 10,
    carbs_g: Math.round(baseCalories * 0.4) / 10,
  };
  return {
    dish: message || 'meal',
    confidence: 0.5,
    totals,
    items: [
      { name: message || 'meal item', grams: 150, protein_g: totals.protein_g / 2, fat_g: totals.fat_g / 2, carbs_g: totals.carbs_g / 2 },
    ],
    warnings: [],
    landing_type: null,
    meta: { model: 'mock', translation: { locale } },
  };
}
