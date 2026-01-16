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
  UpdateUserProfileRequest,
  NotificationSettings,
  UserProfile,
  SlotSelectionRequest,
  NutritionPlanInput,
  DashboardSummary,
  AiReportPeriod,
  AiReportContent,
  AiReportResponse,
  HedgeAttemptReport,
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
  UserProfileResponseSchema,
  UpdateUserProfileRequestSchema,
  SlotSelectionRequestSchema,
  UserProfileSchema,
  NotificationSettingsResponseSchema,
  NotificationSettingsUpdateRequestSchema,
  PushTokenRegisterRequestSchema,
  PushTokenDisableRequestSchema,
  computeNutritionPlan,
  AiReportRequestSchema,
  AiReportContentSchema,
} from '@shared/index.js';
import type { Context } from 'hono';
import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { getAuthSession, requireAuth } from '../_shared/auth.ts';
import {
  resolveMealLogLocalization,
  type LocalizationResolution,
  parseMealLogAiRaw,
  collectTranslations,
  normalizeLocale,
  DEFAULT_LOCALE,
  maybeTranslateNutritionResponse,
  cloneResponse,
} from '../_shared/locale.ts';
import { resolveRequestLocale } from '../_shared/request.ts';
import { resolveRequestTimezone, normalizeTimezone } from '../_shared/timezone.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';
import { isPremium, evaluateAiUsage, recordAiUsage, summarizeUsageStatus, buildUsageLimitError } from '../_shared/ai.ts';
import type { JwtUser } from '../_shared/auth.ts';

const encoder = new TextEncoder();

const app = createApp().basePath('/meal-log');
const LOG_REQUESTS = (Deno.env.get('EDGE_LOG_REQUESTS') ?? '').toLowerCase() === 'true';

// Basic request logging to confirm Edge invocation
app.use('*', async (c, next) => {
  if (LOG_REQUESTS) {
    console.log('[meal-log] request', { method: c.req.method, url: c.req.url });
  }
  await next();
});

// Root and health aliases (under /meal-log/...)
app.get('/', (c) => c.json({ ok: true, service: 'meal-log', message: 'meal-log root' }));
app.get('/health', (c) => c.json({ ok: true, service: 'meal-log' }));
app.get('/api/health', (c) => c.json({ ok: true, service: 'meal-log' }));

const DASHBOARD_TIMEZONE = Deno.env.get('DASHBOARD_TIMEZONE') ?? 'Asia/Tokyo';
const DASHBOARD_TARGETS = {
  calories: { unit: 'kcal', value: 2200, decimals: 0 },
  protein_g: { unit: 'g', value: 130, decimals: 1 },
  fat_g: { unit: 'g', value: 70, decimals: 1 },
  carbs_g: { unit: 'g', value: 260, decimals: 1 },
} as const;

const DEFAULT_QUIET_START = 22 * 60;
const DEFAULT_QUIET_END = 7 * 60;
const DEFAULT_DAILY_CAP = 1;

const SHARE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const FOOD_CATALOGUE = [
  { name: '鶏むね肉グリル', calories: 165, protein_g: 31, fat_g: 3.6, carbs_g: 0 },
  { name: '鮭の塩焼き', calories: 230, protein_g: 25, fat_g: 14, carbs_g: 0 },
  { name: 'サーモン寿司', calories: 320, protein_g: 20, fat_g: 9, carbs_g: 38 },
  { name: 'サラダボウル', calories: 180, protein_g: 5, fat_g: 8, carbs_g: 20 },
  { name: '味噌汁', calories: 80, protein_g: 6, fat_g: 3, carbs_g: 8 },
  { name: 'カレーライス', calories: 650, protein_g: 18, fat_g: 24, carbs_g: 80 },
  { name: '照り焼きチキン', calories: 420, protein_g: 28, fat_g: 18, carbs_g: 32 },
  { name: 'オートミール', calories: 380, protein_g: 13, fat_g: 7, carbs_g: 67 },
] as const;

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
  const normalizedKey = (key as LogsRangeKey | undefined) ?? 'week';
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

const exportQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month']).default('day'),
  anchor: z.string().optional(),
});

const OnboardingEventSchema = z.object({
  eventName: z.enum(['onboarding.step_viewed', 'onboarding.step_completed', 'onboarding.completed']),
  step: z.string().min(1).max(64).optional().nullable(),
  sessionId: z.string().min(1).max(64),
  metadata: z.record(z.unknown()).optional().nullable(),
});

app.get('/health', (c) => c.json({ ok: true, service: 'meal-log' }));

// Premium status (simple placeholder based on isPremium + grants)
app.get('/api/user/premium-status', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;

  // Premium判定（既存ロジックに合わせて期間内のGrantを確認）
  const { data: grants, error } = await supabaseAdmin
    .from('PremiumGrant')
    .select('source, startDate, endDate, createdAt, days')
    .eq('userId', user.id)
    .order('endDate', { ascending: false });

  if (error) {
    console.error('premium-status: fetch failed', error);
    throw new HttpError('プレミアム状態を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const now = new Date();
  const active = (grants ?? []).find((g) => new Date(g.startDate) <= now && new Date(g.endDate) >= now);
  const isPremium = Boolean(active);
  const expiresAt = active ? new Date(active.endDate).toISOString() : null;
  const daysRemaining = active
    ? Math.max(0, Math.ceil((new Date(active.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return c.json({
    isPremium,
    source: (active?.source as string | null) ?? null,
    daysRemaining,
    expiresAt,
    grants: (grants ?? []).map((g) => ({
      source: g.source,
      days: g.days ?? 0,
      startDate: g.startDate,
      endDate: g.endDate,
      createdAt: g.createdAt ?? g.startDate,
    })),
  });
});

app.get('/api/profile', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const profile = await getOrCreateUserProfile(user.id);
  const payload = { ok: true, profile: serializeProfile(profile) };
  UserProfileResponseSchema.parse(payload);
  return c.json(payload);
});

app.post('/api/onboarding/events', async (c) => {
  const body = OnboardingEventSchema.parse(await c.req.json());
  const session = await getAuthSession(c);
  const deviceId = c.req.header('x-device-id') ?? null;

  const metadata = {
    ...(body.metadata ?? {}),
    locale: c.req.header('accept-language') ?? undefined,
    timezone: c.req.header('x-timezone') ?? undefined,
    userAgent: c.req.header('user-agent') ?? undefined,
  };
  const cleanedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
  const metadataPayload = Object.keys(cleanedMetadata).length > 0 ? cleanedMetadata : null;

  const { error } = await supabaseAdmin.from('OnboardingEvent').insert({
    eventName: body.eventName,
    step: body.step ?? null,
    sessionId: body.sessionId,
    userId: session?.user.id ?? null,
    deviceId,
    metadata: metadataPayload,
  });

  if (error) {
    console.error('onboarding events: insert failed', error);
    throw new HttpError('オンボーディングの記録に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return c.json({ ok: true }, HTTP_STATUS.CREATED);
});

app.get('/api/notifications/settings', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const timezone = resolveRequestTimezone(c.req.raw);
  const settings = await getOrCreateNotificationSettings(user.id, { timezone });
  const payload = { ok: true, settings: serializeNotificationSettings(settings) };
  NotificationSettingsResponseSchema.parse(payload);
  return c.json(payload);
});

app.put('/api/notifications/settings', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const body = NotificationSettingsUpdateRequestSchema.parse(await c.req.json());
  const settings = await updateNotificationSettings(user.id, {
    reminderEnabled: body.reminder_enabled,
    importantEnabled: body.important_enabled,
    quietHoursStart: body.quiet_hours_start,
    quietHoursEnd: body.quiet_hours_end,
    dailyCap: body.daily_cap,
    timezone: body.timezone,
  });
  const payload = { ok: true, settings: serializeNotificationSettings(settings) };
  NotificationSettingsResponseSchema.parse(payload);
  return c.json(payload);
});

app.post('/api/notifications/token', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const body = PushTokenRegisterRequestSchema.parse(await c.req.json());
  const timezone = body.timezone ?? resolveRequestTimezone(c.req.raw);
  await upsertPushDevice({
    userId: user.id,
    deviceId: body.device_id,
    expoToken: body.expo_token,
    platform: body.platform,
    locale: body.locale ?? null,
    timezone,
  });
  await updateNotificationSettings(user.id, { timezone });
  return c.json({ ok: true });
});

app.delete('/api/notifications/token', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const body = PushTokenDisableRequestSchema.parse(await c.req.json());
  await disablePushDevice({ userId: user.id, deviceId: body.device_id });
  return c.json({ ok: true });
});

app.put('/api/profile', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const body = UpdateUserProfileRequestSchema.parse(await c.req.json());
  const existing = await getOrCreateUserProfile(user.id);
  const { auto_recalculate: autoRecalculate, ...rest } = body;
  const updateData = mapProfileInput(rest);

  const nutritionInput = buildNutritionInput(rest, existing);
  const userProvidedTargets =
    hasOwn(rest, 'target_calories') || hasOwn(rest, 'target_protein_g') || hasOwn(rest, 'target_fat_g') || hasOwn(rest, 'target_carbs_g');
  const hasPersistedTargets = hasMacroTargets(existing);
  const hasPlanInputs = canComputeNutritionPlan(nutritionInput);
  const shouldAutoPopulate = !userProvidedTargets && !hasPersistedTargets && hasPlanInputs;

  if ((autoRecalculate || shouldAutoPopulate) && hasPlanInputs) {
    const plan = computeNutritionPlan(nutritionInput);
    if (plan) {
      updateData.targetCalories = plan.targetCalories;
      updateData.targetProteinG = plan.proteinGrams;
      updateData.targetFatG = plan.fatGrams;
      updateData.targetCarbsG = plan.carbGrams;
    }
  }

  const updated = await upsertUserProfile(user.id, updateData);
  const payload = { ok: true, profile: serializeProfile(updated), referralClaimed: false, referralResult: null };
  UserProfileResponseSchema.parse(payload);
  return c.json(payload);
});

app.delete('/api/user/account', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  await deleteUserAccount(user.id);
  return c.json({ ok: true });
});

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

  const { data: rows, error } = await supabaseAdmin
    .from('MealLog')
    .select('id, foodItem, calories, proteinG, fatG, carbsG, mealPeriod, landingType, createdAt, imageUrl, aiRaw, FavoriteMeal!FavoriteMeal_sourceMealLogId_fkey ( id )')
    .eq('userId', user.id)
    .is('deletedAt', null)
    .gte('createdAt', range.from.toISOString())
    .lt('createdAt', range.to.toISOString())
    .order('createdAt', { ascending: false })
    .range(query.data.offset, query.data.offset + query.data.limit - 1);

  if (error) {
    console.error('list logs: fetch failed', error);
    throw new HttpError('食事記録の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const items: MealLogListResponse['items'] = (rows ?? []).map((row) => {
    const favoriteId = Array.isArray((row as any).FavoriteMeal) ? (row as any).FavoriteMeal[0]?.id ?? null : null;
    const localization = resolveMealLogLocalization(row.aiRaw, locale);
    const translation = localization.translation;
    const dish = translation?.dish ?? row.foodItem;
    return {
      id: row.id,
      created_at: new Date(row.createdAt).toISOString(),
      dish,
      protein_g: row.proteinG,
      fat_g: row.fatG,
      carbs_g: row.carbsG,
      calories: row.calories,
      meal_period: toMealPeriodLabel(row.mealPeriod) ?? row.landingType ?? null,
      image_url: row.imageUrl ?? null,
      thumbnail_url: null,
      locale: localization.resolvedLocale,
      requested_locale: localization.requestedLocale,
      fallback_applied: localization.fallbackApplied,
      favorite_meal_id: favoriteId,
    };
  });

  const payload = { ok: true, items, range: range.key, timezone } satisfies MealLogListResponse;
  return respondWithCache(c, payload);
});

app.get('/api/logs/summary', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const locale = resolveRequestLocale(c.req.raw);
  const url = new URL(c.req.url);
  const days = Math.min(Number(url.searchParams.get('days') ?? 7), 30);
  const since = DateTime.now().minus({ days }).toJSDate();

  const { data: rows, error } = await supabaseAdmin
    .from('MealLog')
    .select('calories, proteinG, fatG, carbsG, createdAt')
    .eq('userId', user.id)
    .is('deletedAt', null)
    .gte('createdAt', since.toISOString())
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('logs summary: fetch failed', error);
    throw new HttpError('サマリーの取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const dayBuckets = new Map<
    string,
    {
      calories: number;
      protein_g: number;
      fat_g: number;
      carbs_g: number;
    }
  >();

  for (const log of rows ?? []) {
    const dayKey = new Date(log.createdAt).toISOString().slice(0, 10);
    const bucket = dayBuckets.get(dayKey) ?? { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
    bucket.calories += log.calories ?? 0;
    bucket.protein_g += log.proteinG ?? 0;
    bucket.fat_g += log.fatG ?? 0;
    bucket.carbs_g += log.carbsG ?? 0;
    dayBuckets.set(dayKey, bucket);
  }

  const daily = Array.from(dayBuckets.entries()).map(([date, totals]) => ({ date, ...totals }));
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = dayBuckets.get(todayKey) ?? { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

  return respondWithCache(c, { ok: true, today, daily, locale });
});

app.get('/api/log/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');
  const locale = resolveRequestLocale(c.req.raw);
  const item = await fetchMealLogDetail({ userId: user.id, logId, locale });
  return respondWithCache(c, { ok: true, item });
});

app.get('/api/log/:id/share', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');
  const locale = resolveRequestLocale(c.req.raw);
  const share = await buildSharePayload({ userId: user.id, mealLogId: logId, locale });
  return respondWithCache(c, { ok: true, share });
});

app.post('/api/log/:id/translate', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');
  const requestedLocale = normalizeLocale(resolveRequestLocale(c.req.raw, { queryField: 'locale' }));

  await ensureMealLogTranslation({
    userId: user.id,
    logId,
    requestedLocale,
  });

  const result = await buildIdempotentMealLogResult({
    userId: user.id,
    logId,
    requestKey: `translate-${Date.now()}-${logId.slice(0, 6)}`,
    requestedLocale,
  });

  return c.json(result);
});

app.get('/api/logs/export', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const locale = resolveRequestLocale(c.req.raw);
  const url = new URL(c.req.url);
  const parsed = exportQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw new HttpError('未対応の期間指定です', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
  const dataset = await getLogsForExport({
    userId: user.id,
    range: parsed.data.range,
    anchor: parsed.data.anchor,
    locale,
  });
  return respondWithCache(c, { ok: true, range: parsed.data.range, export: dataset });
});

const handleCreateLog = async (c: Context) => {
  const user = c.get('user') as JwtUser;
  const form = await parseMultipart(c);
  if (!form.message && !form.file) {
    throw new HttpError('メッセージまたは画像のいずれかを送信してください。', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  const translationMode = (c.req.header('X-Translation-Mode') ?? '').trim().toLowerCase();
  const deferTranslation = translationMode === 'defer';
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
    deferTranslation,
  });

  return c.json(response);
};

app.post('/api/log', requireAuth, handleCreateLog);
// Legacy path used by mobile client; keep as alias to avoid 404.
app.post('/log', requireAuth, handleCreateLog);

// Idempotency recovery: allow clients to fetch an in-flight /log result by Idempotency-Key.
app.get('/api/ingest/:requestKey', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const requestKey = c.req.param('requestKey');
  if (!requestKey) {
    throw new HttpError('requestKey is required', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  console.log('[meal-log] ingest status', { userId: user.id, requestKey: requestKey.slice(0, 24) });

  const requestedLocale = normalizeLocale(resolveRequestLocale(c.req.raw, { queryField: 'locale' }));

  const { data: ingest, error: ingestError } = await supabaseAdmin
    .from('IngestRequest')
    .select('id, logId, createdAt')
    .eq('userId', user.id)
    .eq('requestKey', requestKey)
    .maybeSingle();

  if (ingestError) {
    console.error('ingest status: fetch failed', ingestError);
    throw new HttpError('解析状況を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!ingest) {
    throw new HttpError('解析リクエストが見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  // Legacy recovery: older builds nulled logId when `zeroFloored` fired.
  // In that case, try to resolve the single log created right after this ingest.
  let resolvedLogId: string | null = ingest.logId ?? null;
  if (!resolvedLogId) {
    const ingestCreatedAtMs = ingest.createdAt ? Date.parse(String(ingest.createdAt)) : Number.NaN;
    if (Number.isFinite(ingestCreatedAtMs)) {
      const windowStartIso = new Date(ingestCreatedAtMs - 1000).toISOString();
      const windowEndIso = new Date(ingestCreatedAtMs + 1000 * 60 * 10).toISOString(); // 10 min
      const { data: candidates, error: candidateError } = await supabaseAdmin
        .from('MealLog')
        .select('id, createdAt')
        .eq('userId', user.id)
        .gte('createdAt', windowStartIso)
        .lte('createdAt', windowEndIso)
        .order('createdAt', { ascending: true })
        .limit(2);

      if (candidateError) {
        console.error('ingest status: candidate lookup failed', { requestKey, userId: user.id, candidateError });
      } else if ((candidates ?? []).length === 1 && candidates?.[0]?.id) {
        resolvedLogId = String(candidates[0].id);
        const { error: backfillError } = await supabaseAdmin
          .from('IngestRequest')
          .update({ logId: resolvedLogId })
          .eq('id', ingest.id);
        if (backfillError) {
          console.error('ingest status: backfill failed', { requestKey, userId: user.id, backfillError });
        }
      } else if ((candidates ?? []).length > 1) {
        console.warn('ingest status: ambiguous candidates', {
          requestKey,
          userId: user.id,
          count: candidates?.length ?? 0,
        });
      }
    }
  }

  if (!resolvedLogId) {
    console.log('[meal-log] ingest status processing', {
      userId: user.id,
      requestKey: requestKey.slice(0, 24),
      createdAt: ingest.createdAt ? new Date(ingest.createdAt).toISOString() : null,
    });
    return c.json({
      ok: true,
      status: 'processing',
      requestKey,
      createdAt: ingest.createdAt ? new Date(ingest.createdAt).toISOString() : null,
    });
  }

  const result = await buildIdempotentMealLogResult({
    userId: user.id,
    logId: resolvedLogId,
    requestKey,
    requestedLocale,
  });

  return c.json({ ok: true, status: 'done', requestKey, result });
});

app.post('/api/log/choose-slot', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const body = SlotSelectionRequestSchema.parse(await c.req.json());
  const updated = await chooseSlot(user.id, body);
  return c.json({ ok: true, item: updated });
});

app.get('/api/foods/search', requireAuth, async (c) => {
  const url = new URL(c.req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 6), 20);
  if (!q) {
    return c.json({ q, candidates: FOOD_CATALOGUE.slice(0, limit) });
  }
  const candidates = FOOD_CATALOGUE.filter((item) => item.name.toLowerCase().includes(q)).slice(0, limit);
  return c.json({ q, candidates });
});

app.delete('/api/log/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('MealLog')
    .select('id')
    .eq('id', logId)
    .eq('userId', user.id)
    .is('deletedAt', null)
    .maybeSingle();

  if (fetchError) {
    console.error('delete log: fetch failed', fetchError);
    throw new HttpError('食事記録の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!existing) {
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const deletedAtValue = new Date().toISOString();

  const { error: shareDeleteError } = await supabaseAdmin.from('LogShareToken').delete().eq('mealLogId', logId);
  if (shareDeleteError) {
    console.error('delete log: share token delete failed', shareDeleteError);
  }

  const { error: favoriteUpdateError } = await supabaseAdmin
    .from('FavoriteMeal')
    .update({ sourceMealLogId: null })
    .eq('userId', user.id)
    .eq('sourceMealLogId', logId);
  if (favoriteUpdateError) {
    console.error('delete log: favorite update failed', favoriteUpdateError);
  }

  const { error: deleteError } = await supabaseAdmin
    .from('MealLog')
    .update({ deletedAt: deletedAtValue })
    .eq('id', logId)
    .eq('userId', user.id);

  if (deleteError) {
    console.error('delete log: update failed', deleteError);
    throw new HttpError('食事記録の削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return c.json({ ok: true, deletedAt: deletedAtValue });
});

app.post('/api/log/:id/restore', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');

  const { data: restored, error: restoreCheckError } = await supabaseAdmin
    .from('MealLog')
    .select('id')
    .eq('id', logId)
    .eq('userId', user.id)
    .not('deletedAt', 'is', null)
    .maybeSingle();

  if (restoreCheckError) {
    console.error('restore log: fetch failed', restoreCheckError);
    throw new HttpError('復元対象の食事記録を確認できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!restored) {
    throw new HttpError('復元対象の食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const { error: updateError } = await supabaseAdmin
    .from('MealLog')
    .update({ deletedAt: null, updatedAt: new Date().toISOString() })
    .eq('id', logId)
    .eq('userId', user.id);

  if (updateError) {
    console.error('restore log: update failed', updateError);
    throw new HttpError('食事記録の復元に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return c.json({ ok: true });
});

app.patch('/api/log/:id', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const logId = c.req.param('id');
  const body = UpdateMealLogRequestSchema.parse(await c.req.json());
  const locale = resolveRequestLocale(c.req.raw);

  const { data: log, error: fetchError } = await supabaseAdmin
    .from('MealLog')
    .select('id, userId, foodItem, calories, proteinG, fatG, carbsG, mealPeriod, aiRaw, version')
    .eq('id', logId)
    .eq('userId', user.id)
    .is('deletedAt', null)
    .maybeSingle();

  if (fetchError) {
    console.error('update log: fetch failed', fetchError);
    throw new HttpError('食事記録の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!log) {
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const updates = mapUpdatePayload(body);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const set: Record<string, unknown> = { version: (log.version ?? 0) + 1, updatedAt: new Date().toISOString() };

  if (typeof updates.foodItem === 'string' && updates.foodItem !== log.foodItem) {
    changes.foodItem = { before: log.foodItem, after: updates.foodItem };
    set.foodItem = updates.foodItem;
  }
  if (typeof updates.calories === 'number' && updates.calories !== log.calories) {
    changes.calories = { before: log.calories, after: updates.calories };
    set.calories = updates.calories;
  }
  if (typeof updates.proteinG === 'number' && updates.proteinG !== log.proteinG) {
    changes.proteinG = { before: log.proteinG, after: updates.proteinG };
    set.proteinG = updates.proteinG;
  }
  if (typeof updates.fatG === 'number' && updates.fatG !== log.fatG) {
    changes.fatG = { before: log.fatG, after: updates.fatG };
    set.fatG = updates.fatG;
  }
  if (typeof updates.carbsG === 'number' && updates.carbsG !== log.carbsG) {
    changes.carbsG = { before: log.carbsG, after: updates.carbsG };
    set.carbsG = updates.carbsG;
  }

  const previousMealPeriod = log.mealPeriod;
  if (typeof updates.mealPeriod !== 'undefined' && updates.mealPeriod !== log.mealPeriod) {
    changes.mealPeriod = { before: log.mealPeriod, after: updates.mealPeriod };
    set.mealPeriod = updates.mealPeriod;
  }

  if (Object.keys(changes).length > 0) {
    const updatedAiRaw = buildUpdatedAiRaw(log.aiRaw, updates);
    set.aiRaw = updatedAiRaw;
  }

  if (Object.keys(set).length <= 2) {
    // No changes requested
    const item = await fetchMealLogDetail({ userId: user.id, logId, locale });
    return c.json({ ok: true, item });
  }

  const { error: updateError } = await supabaseAdmin
    .from('MealLog')
    .update(set)
    .eq('id', logId)
    .eq('userId', user.id);

  if (updateError) {
    console.error('update log: update failed', updateError);
    throw new HttpError('食事記録の更新に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (typeof updates.mealPeriod !== 'undefined' && updates.mealPeriod !== previousMealPeriod) {
    const { error: historyError } = await supabaseAdmin.from('MealLogPeriodHistory').insert({
      mealLogId: logId,
      previousMealPeriod,
      nextMealPeriod: updates.mealPeriod,
      source: 'manual',
    });
    if (historyError) {
      console.error('update log: history insert failed', historyError);
    }
  }

  if (Object.keys(changes).length > 0) {
    const { error: editError } = await supabaseAdmin.from('MealLogEdit').insert({
      mealLogId: logId,
      userId: user.id,
      changes,
    });
    if (editError) {
      console.error('update log: edit insert failed', editError);
    }
  }

  const item = await fetchMealLogDetail({ userId: user.id, logId, locale });
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
  return respondWithCache(c, payload);
});

app.post('/api/reports', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const parsed = AiReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError('invalid payload', { status: HTTP_STATUS.BAD_REQUEST, expose: true, data: parsed.error.flatten() });
  }

  const usageStatus = await evaluateAiUsage(user.id);
  if (!usageStatus.allowed) {
    throw buildUsageLimitError(usageStatus);
  }

  const locale = resolveRequestLocale(c.req.raw);
  const reportParams = resolveReportSummaryParams(parsed.data.period);
  const summary = await getDashboardSummary({
    userId: user.id,
    period: reportParams.period,
    from: reportParams.from,
    to: reportParams.to,
  });

  const context = buildReportContext({ period: parsed.data.period, summary });
  const analysis = await analyzeReportWithGemini({ context, locale });

  const report: AiReportResponse = {
    period: parsed.data.period,
    range: summary.range,
    summary: analysis.report.summary,
    metrics: analysis.report.metrics,
    advice: analysis.report.advice,
    meta: { ...analysis.meta, attemptReports: analysis.attemptReports },
  };

  const usageSummary = await recordAiUsage({
    userId: user.id,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });

  return c.json({ ok: true, report, usage: usageSummary });
});

app.get('/api/dashboard/targets', requireAuth, async (c) => {
  const user = c.get('user') as JwtUser;
  const targets = await resolveUserTargets(user.id);
  const payload = { ok: true, targets };
  DashboardTargetsSchema.parse(targets);
  return respondWithCache(c, payload);
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

// Not-found handler to capture unexpected paths
app.notFound((c) => {
  console.error('[meal-log] not found', { method: c.req.method, url: c.req.url });
  return c.json({ error: 'Not Found' }, HTTP_STATUS.NOT_FOUND);
});

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
  const { data: row, error } = await supabaseAdmin
    .from('MealLog')
    .select('id, userId, foodItem, calories, proteinG, fatG, carbsG, mealPeriod, landingType, createdAt, imageUrl, aiRaw, FavoriteMeal ( id )')
    .eq('id', params.logId)
    .eq('userId', params.userId)
    .is('deletedAt', null)
    .maybeSingle();

  if (error) {
    console.error('fetchMealLogDetail: fetch failed', error);
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!row) {
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const favoriteId = Array.isArray(row.FavoriteMeal) ? row.FavoriteMeal[0]?.id ?? null : null;

  const { data: editsData, error: editsError } = await supabaseAdmin
    .from('MealLogEdit')
    .select('id, createdAt, userId, changes, User ( email, username )')
    .eq('mealLogId', params.logId)
    .order('createdAt', { ascending: false });

  if (editsError) {
    console.error('fetchMealLogDetail: edits fetch failed', editsError);
    throw new HttpError('編集履歴を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const { data: historyData, error: historyError } = await supabaseAdmin
    .from('MealLogPeriodHistory')
    .select('id, previousMealPeriod, nextMealPeriod, source, createdAt')
    .eq('mealLogId', params.logId)
    .order('createdAt', { ascending: false });

  if (historyError) {
    console.error('fetchMealLogDetail: period history fetch failed', historyError);
    throw new HttpError('履歴を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

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
    created_at: new Date(row.createdAt).toISOString(),
    image_url: row.imageUrl ?? null,
    ai_raw: buildAiRawPayload(localization),
    locale: localization.resolvedLocale,
    requested_locale: localization.requestedLocale,
    fallback_applied: localization.fallbackApplied,
    favorite_meal_id: favoriteId,
    history:
      editsData?.map((entry) => ({
        id: entry.id,
        created_at: new Date(entry.createdAt).toISOString(),
        user_id: entry.userId,
        user_email: (entry as any)?.User?.email ?? null,
        user_name: (entry as any)?.User?.username ?? null,
        changes: entry.changes ?? {},
      })) ?? [],
    time_history:
      historyData?.map((entry) => ({
        id: entry.id,
        previous: toMealPeriodLabel(entry.previousMealPeriod),
        next: toMealPeriodLabel(entry.nextMealPeriod),
        source: entry.source,
        changed_at: new Date(entry.createdAt).toISOString(),
      })) ?? [],
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

type DbUserProfile = {
  userId: number;
  displayName?: string | null;
  gender?: string | null;
  birthdate?: string | Date | null;
  heightCm?: number | null;
  unitPreference?: string | null;
  marketingSource?: string | null;
  referralCode?: string | null;
  goals?: string[] | null;
  targetCalories?: number | null;
  targetProteinG?: number | null;
  targetFatG?: number | null;
  targetCarbsG?: number | null;
  bodyWeightKg?: number | null;
  currentWeightKg?: number | null;
  targetWeightKg?: number | null;
  planIntensity?: string | null;
  targetDate?: string | Date | null;
  activityLevel?: string | null;
  appleHealthLinked?: boolean | null;
  questionnaireCompletedAt?: string | Date | null;
  language?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

async function getOrCreateUserProfile(userId: number): Promise<DbUserProfile> {
  const { data, error } = await supabaseAdmin.from('UserProfile').select('*').eq('userId', userId).maybeSingle();
  if (error) {
    console.error('profile: fetch failed', error);
    throw new HttpError('プロフィールの取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  if (data) return data;

  const nowIso = new Date().toISOString();
  const { data: created, error: createError } = await supabaseAdmin
    .from('UserProfile')
    .insert({ userId, createdAt: nowIso, updatedAt: nowIso })
    .select('*')
    .single();

  if (createError || !created) {
    console.error('profile: create failed', createError);
    throw new HttpError('プロフィールの作成に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  return created;
}

function serializeProfile(profile: DbUserProfile): UserProfile {
  const toIso = (value: string | Date | null | undefined) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const payload = {
    display_name: profile.displayName ?? null,
    gender: (profile.gender as UserProfile['gender']) ?? null,
    birthdate: toIso(profile.birthdate),
    height_cm: profile.heightCm ?? null,
    unit_preference: (profile.unitPreference as UserProfile['unit_preference']) ?? null,
    marketing_source: profile.marketingSource ?? null,
    marketing_referral_code: profile.referralCode ?? null,
    goals: profile.goals ?? [],
    target_calories: profile.targetCalories ?? null,
    target_protein_g: profile.targetProteinG ?? null,
    target_fat_g: profile.targetFatG ?? null,
    target_carbs_g: profile.targetCarbsG ?? null,
    body_weight_kg: profile.bodyWeightKg ?? null,
    current_weight_kg: profile.currentWeightKg ?? null,
    target_weight_kg: profile.targetWeightKg ?? null,
    plan_intensity: (profile.planIntensity as UserProfile['plan_intensity']) ?? null,
    target_date: toIso(profile.targetDate),
    activity_level: (profile.activityLevel as UserProfile['activity_level']) ?? null,
    apple_health_linked: profile.appleHealthLinked ?? false,
    questionnaire_completed_at: toIso(profile.questionnaireCompletedAt),
    language: (profile.language as UserProfile['language']) ?? null,
    updated_at: toIso(profile.updatedAt) ?? new Date().toISOString(),
  };

  UserProfileSchema.parse(payload);
  return payload;
}

type DbNotificationSettings = {
  id: number;
  userId: number;
  reminderEnabled: boolean;
  importantEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  dailyCap: number;
  timezone?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

async function getOrCreateNotificationSettings(
  userId: number,
  options: { timezone?: string | null } = {},
): Promise<DbNotificationSettings> {
  const { data, error } = await supabaseAdmin
    .from('NotificationSettings')
    .select('*')
    .eq('userId', userId)
    .maybeSingle();
  if (error) {
    console.error('notification settings: fetch failed', error);
    throw new HttpError('通知設定の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  if (data) return data;

  const nowIso = new Date().toISOString();
  const timezone = options.timezone ? normalizeTimezone(options.timezone) : null;
  const { data: created, error: createError } = await supabaseAdmin
    .from('NotificationSettings')
    .insert({
      userId,
      reminderEnabled: false,
      importantEnabled: false,
      quietHoursStart: DEFAULT_QUIET_START,
      quietHoursEnd: DEFAULT_QUIET_END,
      dailyCap: DEFAULT_DAILY_CAP,
      timezone,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .select('*')
    .single();

  if (createError || !created) {
    console.error('notification settings: create failed', createError);
    throw new HttpError('通知設定の作成に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  return created;
}

function serializeNotificationSettings(settings: DbNotificationSettings): NotificationSettings {
  return {
    reminder_enabled: Boolean(settings.reminderEnabled),
    important_enabled: Boolean(settings.importantEnabled),
    quiet_hours_start: clampMinutes(settings.quietHoursStart ?? DEFAULT_QUIET_START),
    quiet_hours_end: clampMinutes(settings.quietHoursEnd ?? DEFAULT_QUIET_END),
    daily_cap: clampDailyCap(settings.dailyCap ?? DEFAULT_DAILY_CAP),
    timezone: normalizeTimezone(settings.timezone ?? undefined),
  };
}

async function updateNotificationSettings(
  userId: number,
  updates: Partial<{
    reminderEnabled: boolean;
    importantEnabled: boolean;
    quietHoursStart: number;
    quietHoursEnd: number;
    dailyCap: number;
    timezone: string | null;
  }>,
): Promise<DbNotificationSettings> {
  const existing = await getOrCreateNotificationSettings(userId, { timezone: updates.timezone ?? null });
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from('NotificationSettings')
    .update({
      reminderEnabled: updates.reminderEnabled ?? existing.reminderEnabled,
      importantEnabled: updates.importantEnabled ?? existing.importantEnabled,
      quietHoursStart: clampMinutes(updates.quietHoursStart ?? existing.quietHoursStart),
      quietHoursEnd: clampMinutes(updates.quietHoursEnd ?? existing.quietHoursEnd),
      dailyCap: clampDailyCap(updates.dailyCap ?? existing.dailyCap),
      timezone: updates.timezone !== undefined ? normalizeTimezone(updates.timezone) : existing.timezone,
      updatedAt: nowIso,
    })
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error || !updated) {
    console.error('notification settings: update failed', error);
    throw new HttpError('通知設定の更新に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  return updated;
}

async function upsertPushDevice(params: {
  userId: number;
  deviceId: string;
  expoToken: string;
  platform: string;
  locale?: string | null;
  timezone?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const timezone = params.timezone ? normalizeTimezone(params.timezone) : null;
  const { error } = await supabaseAdmin
    .from('PushDevice')
    .upsert(
      {
        userId: params.userId,
        deviceId: params.deviceId,
        expoToken: params.expoToken,
        platform: params.platform,
        locale: params.locale ?? null,
        timezone,
        lastSeenAt: nowIso,
        disabledAt: null,
        updatedAt: nowIso,
      },
      { onConflict: 'userId,deviceId' },
    );

  if (error) {
    console.error('push device: upsert failed', error);
    throw new HttpError('通知デバイスの登録に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
}

async function disablePushDevice(params: { userId: number; deviceId: string }) {
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('PushDevice')
    .update({ disabledAt: nowIso, updatedAt: nowIso })
    .eq('userId', params.userId)
    .eq('deviceId', params.deviceId)
    .is('disabledAt', null);

  if (error) {
    console.error('push device: disable failed', error);
    throw new HttpError('通知デバイスの解除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_QUIET_START;
  }
  return Math.max(0, Math.min(1439, Math.round(value)));
}

function clampDailyCap(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_DAILY_CAP;
  }
  return Math.max(1, Math.min(5, Math.round(value)));
}

function mapProfileInput(input: UpdateUserProfileRequest) {
  const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (hasOwn(input, 'display_name')) data.displayName = input.display_name ?? null;
  if (hasOwn(input, 'gender')) data.gender = input.gender ?? null;
  if (hasOwn(input, 'birthdate')) data.birthdate = input.birthdate ? new Date(input.birthdate) : null;
  if (hasOwn(input, 'height_cm')) data.heightCm = input.height_cm ?? null;
  if (hasOwn(input, 'unit_preference')) data.unitPreference = input.unit_preference ?? null;
  if (hasOwn(input, 'marketing_source')) data.marketingSource = input.marketing_source ?? null;
  if (hasOwn(input, 'marketing_referral_code')) data.referralCode = input.marketing_referral_code ?? null;
  if (hasOwn(input, 'goals')) data.goals = input.goals ?? [];
  if (hasOwn(input, 'target_calories')) data.targetCalories = input.target_calories ?? null;
  if (hasOwn(input, 'target_protein_g')) data.targetProteinG = input.target_protein_g ?? null;
  if (hasOwn(input, 'target_fat_g')) data.targetFatG = input.target_fat_g ?? null;
  if (hasOwn(input, 'target_carbs_g')) data.targetCarbsG = input.target_carbs_g ?? null;
  if (hasOwn(input, 'body_weight_kg')) data.bodyWeightKg = input.body_weight_kg ?? null;
  if (hasOwn(input, 'current_weight_kg')) data.currentWeightKg = input.current_weight_kg ?? null;
  if (hasOwn(input, 'target_weight_kg')) data.targetWeightKg = input.target_weight_kg ?? null;
  if (hasOwn(input, 'plan_intensity')) data.planIntensity = input.plan_intensity ?? null;
  if (hasOwn(input, 'target_date')) data.targetDate = input.target_date ? new Date(input.target_date) : null;
  if (hasOwn(input, 'activity_level')) data.activityLevel = input.activity_level ?? null;
  if (hasOwn(input, 'apple_health_linked')) data.appleHealthLinked = input.apple_health_linked ?? null;
  if (hasOwn(input, 'questionnaire_completed_at')) data.questionnaireCompletedAt = input.questionnaire_completed_at ?? null;
  if (hasOwn(input, 'language')) data.language = input.language ?? null;

  return data;
}

function buildNutritionInput(input: UpdateUserProfileRequest, existing: DbUserProfile): NutritionPlanInput {
  const toDateOrNull = (value: string | Date | null | undefined) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const maybe = <K extends keyof UpdateUserProfileRequest>(key: K, fallback: unknown) =>
    hasOwn(input, key) ? (input[key] as UpdateUserProfileRequest[K]) : fallback;

  return {
    gender: maybe('gender', existing.gender ?? null),
    birthdate: toDateOrNull(maybe('birthdate', existing.birthdate ?? null)),
    heightCm: maybe('height_cm', existing.heightCm ?? null) as number | null | undefined,
    currentWeightKg: (maybe('current_weight_kg', existing.currentWeightKg ?? existing.bodyWeightKg ?? null) ??
      null) as number | null,
    targetWeightKg: maybe('target_weight_kg', existing.targetWeightKg ?? null) as number | null | undefined,
    activityLevel: maybe('activity_level', existing.activityLevel ?? null) as NutritionPlanInput['activityLevel'],
    planIntensity: maybe('plan_intensity', existing.planIntensity ?? null) as NutritionPlanInput['planIntensity'],
    goals: maybe('goals', existing.goals ?? []),
  };
}

function hasOwn<T extends object>(obj: T, key: keyof any): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function hasMacroTargets(profile: DbUserProfile | null | undefined) {
  if (!profile) return false;
  return (
    profile.targetCalories != null ||
    profile.targetProteinG != null ||
    profile.targetFatG != null ||
    profile.targetCarbsG != null
  );
}

function canComputeNutritionPlan(input: NutritionPlanInput) {
  try {
    return Boolean(computeNutritionPlan(input));
  } catch (_error) {
    return false;
  }
}

async function upsertUserProfile(userId: number, data: Record<string, unknown>): Promise<DbUserProfile> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('UserProfile')
    .select('id')
    .eq('userId', userId)
    .maybeSingle();

  if (existingError) {
    console.error('profile: check existing failed', existingError);
    throw new HttpError('プロフィールの更新に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (existing) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('UserProfile')
      .update(data)
      .eq('userId', userId)
      .select('*')
      .single();
    if (updateError || !updated) {
      console.error('profile: update failed', updateError);
      throw new HttpError('プロフィールの更新に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    return updated;
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from('UserProfile')
    .insert({ userId, ...data })
    .select('*')
    .single();
  if (createError || !created) {
    console.error('profile: insert failed', createError);
    throw new HttpError('プロフィールの作成に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  return created;
}

async function deleteUserAccount(userId: number) {
  const { data: logs, error: logsError } = await supabaseAdmin.from('MealLog').select('id').eq('userId', userId);
  if (logsError) {
    console.error('account delete: fetch logs failed', logsError);
    throw new HttpError('アカウント削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  const logIds = (logs ?? []).map((row) => row.id);

  if (logIds.length > 0) {
    const { error: mediaError } = await supabaseAdmin.from('MediaAsset').delete().in('mealLogId', logIds);
    if (mediaError) {
      console.error('account delete: delete media failed', mediaError);
      throw new HttpError('アカウント削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    const { error: editError } = await supabaseAdmin.from('MealLogEdit').delete().in('mealLogId', logIds);
    if (editError) {
      console.error('account delete: delete edits failed', editError);
      throw new HttpError('アカウント削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    const { error: periodError } = await supabaseAdmin.from('MealLogPeriodHistory').delete().in('mealLogId', logIds);
    if (periodError) {
      console.error('account delete: delete period history failed', periodError);
      throw new HttpError('アカウント削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    const { error: shareError } = await supabaseAdmin.from('LogShareToken').delete().in('mealLogId', logIds);
    if (shareError) {
      console.error('account delete: delete share tokens failed', shareError);
      throw new HttpError('アカウント削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    const { error: favoriteUpdateError } = await supabaseAdmin
      .from('FavoriteMeal')
      .update({ sourceMealLogId: null })
      .eq('userId', userId)
      .in('sourceMealLogId', logIds);
    if (favoriteUpdateError) {
      console.error('account delete: detach favorites failed', favoriteUpdateError);
      throw new HttpError('アカウント削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
  }

  const deletions = [
    { label: 'favorites', promise: supabaseAdmin.from('FavoriteMeal').delete().eq('userId', userId) },
    { label: 'ingest', promise: supabaseAdmin.from('IngestRequest').delete().eq('userId', userId) },
    { label: 'ai usage', promise: supabaseAdmin.from('AiUsageCounter').delete().eq('userId', userId) },
    { label: 'iap', promise: supabaseAdmin.from('IapReceipt').delete().eq('userId', userId) },
    { label: 'premium', promise: supabaseAdmin.from('PremiumGrant').delete().eq('userId', userId) },
    { label: 'referral', promise: supabaseAdmin.from('Referral').delete().or(`referrerUserId.eq.${userId},referredUserId.eq.${userId}`) },
    { label: 'referral links', promise: supabaseAdmin.from('ReferralInviteLink').delete().eq('userId', userId) },
    { label: 'share tokens', promise: supabaseAdmin.from('LogShareToken').delete().eq('userId', userId) },
    { label: 'meal logs', promise: supabaseAdmin.from('MealLog').delete().eq('userId', userId) },
    { label: 'profile', promise: supabaseAdmin.from('UserProfile').delete().eq('userId', userId) },
    { label: 'user', promise: supabaseAdmin.from('User').delete().eq('id', userId) },
  ] as const;

  for (const entry of deletions) {
    const { error: deleteError } = await entry.promise;
    if (deleteError) {
      console.error(`account delete: ${entry.label} delete failed`, deleteError);
      throw new HttpError('アカウント削除に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
  }
}

async function buildSharePayload(params: { userId: number; mealLogId: string; locale: Locale }) {
  const { data: log, error } = await supabaseAdmin
    .from('MealLog')
    .select('id, foodItem, calories, proteinG, fatG, carbsG, aiRaw, createdAt, landingType')
    .eq('id', params.mealLogId)
    .eq('userId', params.userId)
    .is('deletedAt', null)
    .maybeSingle();

  if (error) {
    console.error('share: fetch log failed', error);
    throw new HttpError('食事記録の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  if (!log) {
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('LogShareToken')
    .select('id, token, expiresAt')
    .eq('mealLogId', params.mealLogId)
    .eq('userId', params.userId)
    .gt('expiresAt', nowIso)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error('share: fetch token failed', existingError);
    throw new HttpError('共有リンクの生成に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  let token = existing?.token ?? crypto.randomUUID();
  let expiresAt = existing?.expiresAt ?? new Date(now.getTime() + SHARE_TOKEN_TTL_MS).toISOString();

  if (existing) {
    await supabaseAdmin.from('LogShareToken').update({ lastAccessed: nowIso }).eq('id', existing.id);
  } else {
    const { data: created, error: insertError } = await supabaseAdmin
      .from('LogShareToken')
      .insert({
        token,
        mealLogId: params.mealLogId,
        userId: params.userId,
        expiresAt,
        lastAccessed: nowIso,
        createdAt: nowIso,
      })
      .select('token, expiresAt')
      .single();

    if (insertError || !created) {
      console.error('share: insert token failed', insertError);
      throw new HttpError('共有リンクの生成に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    token = created.token;
    expiresAt = created.expiresAt;
  }

  const localization = resolveMealLogLocalization(log.aiRaw, params.locale);
  const translation = localization.translation;
  const text = formatShareText(
    {
      foodItem: translation?.dish ?? log.foodItem,
      calories: log.calories,
      proteinG: log.proteinG,
      fatG: log.fatG,
      carbsG: log.carbsG,
      createdAt: log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt),
      resolvedLocale: localization.resolvedLocale,
      requestedLocale: localization.requestedLocale,
      fallbackApplied: localization.fallbackApplied,
    },
    params.locale,
  );

  return {
    text,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
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
} as const;

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
  const recordedAt = DateTime.fromJSDate(log.createdAt)
    .setZone('Asia/Tokyo')
    .setLocale(locale.startsWith('en') ? 'en' : 'ja');

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

function roundLabel(value: number | null | undefined) {
  if (!Number.isFinite(value ?? null)) return 0;
  return Math.round((value as number) * 10) / 10;
}

async function getLogsForExport(params: { userId: number; range: 'day' | 'week' | 'month'; anchor?: string; locale: Locale }) {
  const { from, to } = resolveExportRange(params.range, params.anchor);
  const { data: logs, error } = await supabaseAdmin
    .from('MealLog')
    .select('id, foodItem, calories, proteinG, fatG, carbsG, mealPeriod, aiRaw, createdAt, landingType')
    .eq('userId', params.userId)
    .is('deletedAt', null)
    .gte('createdAt', from.toISO())
    .lt('createdAt', to.toISO())
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('logs export: fetch failed', error);
    throw new HttpError('エクスポートの取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const items =
    logs?.map((log) => {
      const localization = resolveMealLogLocalization(log.aiRaw, params.locale);
      const translation = localization.translation;
      return {
        id: log.id,
        recordedAt: (log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt)).toISOString(),
        foodItem: translation?.dish ?? log.foodItem,
        calories: log.calories,
        proteinG: log.proteinG,
        fatG: log.fatG,
        carbsG: log.carbsG,
        mealPeriod: log.mealPeriod ?? log.landingType ?? null,
        locale: localization.resolvedLocale,
        requestedLocale: localization.requestedLocale,
        fallbackApplied: localization.fallbackApplied,
      };
    }) ?? [];

  return {
    from: from.toISO(),
    to: to.toISO(),
    items,
  };
}

function resolveExportRange(range: 'day' | 'week' | 'month', anchor?: string) {
  const base = anchor ? DateTime.fromISO(anchor) : DateTime.now();
  if (!base.isValid) {
    throw new HttpError('アンカー日付が無効です', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
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
      throw new HttpError('未対応の期間指定です', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
}

async function chooseSlot(userId: number, request: SlotSelectionRequest) {
  const { data: log, error } = await supabaseAdmin
    .from('MealLog')
    .select('id, userId, aiRaw, version')
    .eq('id', request.logId)
    .eq('userId', userId)
    .is('deletedAt', null)
    .maybeSingle();

  if (error) {
    console.error('choose-slot: fetch failed', error);
    throw new HttpError('食事記録の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  if (!log) {
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  if ((log.version ?? 0) !== request.prevVersion) {
    throw new HttpError('編集競合が発生しました。最新の内容を確認してください', {
      status: HTTP_STATUS.CONFLICT,
      expose: true,
    });
  }

  const aiRaw = (log.aiRaw ?? {}) as Record<string, unknown> & { slots?: Record<string, unknown> };
  const slots = { ...(aiRaw.slots ?? {}) };
  slots[request.key] = request.value;

  const nextVersion = (log.version ?? 0) + 1;
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('MealLog')
    .update({
      aiRaw: { ...aiRaw, slots },
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', log.id)
    .eq('userId', userId)
    .select('id, aiRaw, version, updatedAt')
    .single();

  if (updateError || !updated) {
    console.error('choose-slot: update failed', updateError);
    throw new HttpError('スロットの更新に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return updated;
}

type ProcessMealLogParams = {
  userId: number;
  message: string;
  file?: File | undefined;
  idempotencyKey?: string;
  locale?: Locale;
  timezone?: string;
  deferTranslation?: boolean;
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

  const { data: ingestExisting, error: ingestFetchError } = await supabaseAdmin
    .from('IngestRequest')
    .select('id, logId, requestKey')
    .eq('userId', params.userId)
    .eq('requestKey', requestKey)
    .maybeSingle();

  if (ingestFetchError) {
    console.error('processMealLog: fetch ingest failed', ingestFetchError);
    throw new HttpError('食事記録の処理に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (ingestExisting?.logId) {
    return await buildIdempotentMealLogResult({
      userId: params.userId,
      logId: ingestExisting.logId,
      requestKey,
      requestedLocale,
    });
  }

  const usageStatus = await evaluateAiUsage(params.userId);
  if (!usageStatus.allowed) {
    throw buildUsageLimitError(usageStatus);
  }

  let ingestId: number | null = null;
  if (!ingestExisting) {
    const { data: inserted, error: ingestInsertError } = await supabaseAdmin
      .from('IngestRequest')
      .insert({ userId: params.userId, requestKey })
      .select('id')
      .single();
    if (ingestInsertError || !inserted) {
      console.error('processMealLog: insert ingest failed', ingestInsertError);
      throw new HttpError('食事記録の処理に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    ingestId = inserted.id;
  } else {
    ingestId = ingestExisting.id;
  }

  const imageMimeType = params.file?.type;
  const imageBase64 = params.file ? await fileToBase64(params.file) : undefined;

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
  if (zeroFloored) {
    console.warn('processMealLog: zeroFloored detected', {
      userId: params.userId,
      requestKey: requestKey.slice(0, 24),
      totals: enrichedResponse.totals,
    });
  }

  const seededTranslations: Record<Locale, GeminiNutritionResponse> = {
    [DEFAULT_LOCALE]: cloneResponse(enrichedResponse),
  };
  if (!params.deferTranslation && requestedLocale !== DEFAULT_LOCALE) {
    const localized = await maybeTranslateNutritionResponse(enrichedResponse, requestedLocale);
    if (localized) {
      seededTranslations[requestedLocale] = localized;
    }
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

  const logId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const { data: createdLog, error: logInsertError } = await supabaseAdmin
    .from('MealLog')
    .insert({
      id: logId,
      userId: params.userId,
      foodItem: translation.dish ?? params.message,
      calories: enrichedResponse.totals.kcal,
      proteinG: enrichedResponse.totals.protein_g,
      fatG: enrichedResponse.totals.fat_g,
      carbsG: enrichedResponse.totals.carbs_g,
      aiRaw: aiPayload,
      zeroFloored,
      guardrailNotes: zeroFloored ? 'zeroFloored' : null,
      landingType: enrichedResponse.landing_type ?? null,
      mealPeriod,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .select('id')
    .single();

  if (logInsertError || !createdLog) {
    console.error('processMealLog: insert meal log failed', logInsertError);
    throw new HttpError('食事記録を作成できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }
  // Use returned id if present; fallback to generated one.
  const createdLogId = createdLog.id ?? logId;

  const { error: historyError } = await supabaseAdmin.from('MealLogPeriodHistory').insert({
    mealLogId: createdLogId,
    previousMealPeriod: null,
    nextMealPeriod: mealPeriod,
    source: 'auto',
  });
  if (historyError) {
    console.error('processMealLog: insert period history failed', historyError);
  }

  if (params.file && imageBase64) {
    const imageUrl = `data:${params.file.type};base64,${imageBase64}`;
    const { error: mediaError } = await supabaseAdmin.from('MediaAsset').insert({
      mealLogId: createdLogId,
      mimeType: params.file.type,
      url: imageUrl,
      sizeBytes: params.file.size,
    });
    if (mediaError) {
      console.error('processMealLog: insert media asset failed', mediaError);
    }
    const { error: updateImageError } = await supabaseAdmin.from('MealLog').update({ imageUrl }).eq('id', createdLogId);
    if (updateImageError) {
      console.error('processMealLog: update imageUrl failed', updateImageError);
    }
  }

  if (ingestId) {
    const { error: ingestUpdateError } = await supabaseAdmin
      .from('IngestRequest')
      .update({ logId: createdLogId })
      .eq('id', ingestId);
    if (ingestUpdateError) {
      console.error('processMealLog: update ingest failed', ingestUpdateError);
    }
  }

  const usageSummary = await recordAiUsage({
    userId: params.userId,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });

  const meta: Record<string, unknown> = {
    ...(enrichedResponse.meta ?? {}),
    imageUrl: params.file ? `data:${params.file.type};base64,${imageBase64 ?? ''}` : null,
    fallback_model_used: analysis.meta.attempt > 1,
    mealPeriod,
    timezone,
    localization: buildLocalizationMeta({ ...localization, translations: responseTranslations }),
  };

  const favoriteCandidate = buildFavoriteDraftPayload({
    translation,
    totals: translation.totals,
    items: responseItems,
    fallbackDish: translation.dish ?? params.message,
    sourceMealLogId: createdLogId,
  });

  return {
    ok: true,
    success: true,
    idempotent: false,
    idempotency_key: requestKey,
    logId: createdLogId,
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
    usage: usageSummary,
    favoriteCandidate,
  };
}

async function buildIdempotentMealLogResult(params: {
  userId: number;
  logId: string;
  requestKey: string;
  requestedLocale: Locale;
}): Promise<ProcessMealLogResult> {
  const log = await fetchMealLogDetail({ userId: params.userId, logId: params.logId, locale: params.requestedLocale });
  const usageStatus = await evaluateAiUsage(params.userId);
  const usageSummary = summarizeUsageStatus(usageStatus);

  const totalsFallback = {
    kcal: log.calories,
    protein_g: log.protein_g,
    fat_g: log.fat_g,
    carbs_g: log.carbs_g,
  };

  return {
    ok: true,
    success: true,
    idempotent: true,
    idempotency_key: params.requestKey,
    logId: log.id,
    requestLocale: log.requested_locale ?? params.requestedLocale,
    locale: log.locale ?? params.requestedLocale,
    translations: buildTranslationMap(log.ai_raw),
    fallbackApplied: log.fallback_applied ?? false,
    dish: log.food_item,
    confidence: log.ai_raw?.confidence ?? 0.6,
    totals: log.ai_raw?.totals ?? totalsFallback,
    items: log.ai_raw?.items ?? [],
    breakdown: {
      items: log.ai_raw?.items ?? [],
      warnings: log.ai_raw?.warnings ?? [],
    },
    meta: {
      idempotent: true,
    },
    usage: usageSummary,
    favoriteCandidate: buildFavoriteDraftFallback(log),
  };
}

async function ensureMealLogTranslation(params: {
  userId: number;
  logId: string;
  requestedLocale: Locale;
}) {
  const targetLocale = normalizeLocale(params.requestedLocale);
  if (targetLocale === DEFAULT_LOCALE) {
    return;
  }

  const { data: row, error } = await supabaseAdmin
    .from('MealLog')
    .select('id, aiRaw')
    .eq('id', params.logId)
    .eq('userId', params.userId)
    .is('deletedAt', null)
    .maybeSingle();

  if (error) {
    console.error('translate log: fetch failed', error);
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!row) {
    throw new HttpError('食事記録が見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const parsed = parseMealLogAiRaw(row.aiRaw);
  const translations = collectTranslations(row.aiRaw, parsed);

  if (translations[targetLocale]) {
    return;
  }

  const baseLocale = parsed?.locale ? normalizeLocale(parsed.locale) : DEFAULT_LOCALE;
  const baseTranslation =
    translations[baseLocale] ??
    translations[DEFAULT_LOCALE] ??
    Object.values(translations)[0];

  if (!baseTranslation) {
    console.warn('translate log: missing base translation', { logId: params.logId });
    return;
  }

  const translated = await maybeTranslateNutritionResponse(baseTranslation, targetLocale);
  if (!translated) {
    return;
  }

  const updatedTranslations = { ...translations, [targetLocale]: translated };
  const updatedAiRaw = parsed
    ? { ...parsed, translations: updatedTranslations, locale: parsed.locale ?? baseLocale }
    : { ...cloneResponse(baseTranslation), locale: baseLocale, translations: updatedTranslations };

  const { error: updateError } = await supabaseAdmin
    .from('MealLog')
    .update({ aiRaw: updatedAiRaw })
    .eq('id', params.logId)
    .eq('userId', params.userId);

  if (updateError) {
    console.error('translate log: update failed', updateError);
  }
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

async function respondWithCache(c: Context, payload: unknown, status: number = HTTP_STATUS.OK) {
  const etag = await computeEtag(payload);
  const ifNoneMatch = c.req.header('if-none-match');
  c.header('Cache-Control', 'private, max-age=60');
  c.header('ETag', etag);

  if (ifNoneMatch && ifNoneMatch === etag) {
    return c.body(null, 304);
  }

  return c.json(payload, status);
}

async function computeEtag(value: unknown): Promise<string> {
  const data = encoder.encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `W/"${hex}"`;
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

  const { data: favorite, error } = await supabaseAdmin
    .from('FavoriteMeal')
    .insert({
      userId,
      sourceMealLogId: normalized.source_log_id,
      name: normalized.name,
      notes: normalized.notes,
      calories: normalized.totals.kcal,
      proteinG: normalized.totals.protein_g,
      fatG: normalized.totals.fat_g,
      carbsG: normalized.totals.carbs_g,
    })
    .select('id')
    .single();

  if (error || !favorite) {
    console.error('createFavoriteMeal: insert favorite failed', error);
    throw new HttpError('お気に入りを作成できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const favoriteId = favorite.id;

  if (normalized.items.length > 0) {
    const { error: itemsError } = await supabaseAdmin.from('FavoriteMealItem').insert(
      normalized.items.map((item, idx) => ({
        favoriteMealId: favoriteId,
        name: item.name,
        grams: item.grams,
        calories: item.calories ?? null,
        proteinG: item.protein_g ?? null,
        fatG: item.fat_g ?? null,
        carbsG: item.carbs_g ?? null,
        orderIndex: item.order_index ?? idx,
      })),
    );
    if (itemsError) {
      console.error('createFavoriteMeal: insert items failed', itemsError);
      throw new HttpError('お気に入りを作成できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
  }

  return getFavoriteMeal(userId, favoriteId);
}

async function listFavoriteMeals(userId: number): Promise<FavoriteMeal[]> {
  const { data: favorites, error } = await supabaseAdmin
    .from('FavoriteMeal')
    .select('id, name, notes, calories, proteinG, fatG, carbsG, sourceMealLogId, createdAt, updatedAt')
    .eq('userId', userId)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('listFavoriteMeals: fetch favorites failed', error);
    throw new HttpError('お気に入り一覧を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!favorites?.length) return [];

  const ids = favorites.map((f) => f.id);
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('FavoriteMealItem')
    .select('id, favoriteMealId, name, grams, calories, proteinG, fatG, carbsG, orderIndex')
    .in('favoriteMealId', ids)
    .order('orderIndex', { ascending: true })
    .order('id', { ascending: true });

  if (itemsError) {
    console.error('listFavoriteMeals: fetch items failed', itemsError);
    throw new HttpError('お気に入り一覧を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const itemsByFavorite = new Map<number, typeof items>();
  for (const item of items ?? []) {
    const list = itemsByFavorite.get(item.favoriteMealId) ?? [];
    list.push(item);
    itemsByFavorite.set(item.favoriteMealId, list);
  }

  return favorites.map((fav) => mapFavoriteMeal(fav as any, itemsByFavorite.get(fav.id) ?? []));
}

async function getFavoriteMeal(userId: number, favoriteId: number): Promise<FavoriteMeal> {
  const { data: favorite, error } = await supabaseAdmin
    .from('FavoriteMeal')
    .select('id, name, notes, calories, proteinG, fatG, carbsG, sourceMealLogId, createdAt, updatedAt')
    .eq('id', favoriteId)
    .eq('userId', userId)
    .maybeSingle();

  if (error) {
    console.error('getFavoriteMeal: fetch favorite failed', error);
    throw new HttpError('お気に入りを取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!favorite) {
    throw new HttpError('お気に入りが見つかりませんでした', { status: HTTP_STATUS.NOT_FOUND, expose: true });
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('FavoriteMealItem')
    .select('id, favoriteMealId, name, grams, calories, proteinG, fatG, carbsG, orderIndex')
    .eq('favoriteMealId', favoriteId)
    .order('orderIndex', { ascending: true })
    .order('id', { ascending: true });

  if (itemsError) {
    console.error('getFavoriteMeal: fetch items failed', itemsError);
    throw new HttpError('お気に入りを取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return mapFavoriteMeal(favorite as any, items ?? []);
}

async function updateFavoriteMeal(userId: number, favoriteId: number, payload: unknown): Promise<FavoriteMeal> {
  const parsed = FavoriteMealUpdateRequestSchema.parse(payload);
  const existing = await getFavoriteMeal(userId, favoriteId);

  const totals = resolveTotals(parsed, existing);

  const { error: updateError } = await supabaseAdmin
    .from('FavoriteMeal')
    .update({
      name: parsed.name ?? existing.name,
      notes: parsed.notes ?? existing.notes,
      sourceMealLogId: parsed.source_log_id ?? existing.source_log_id,
      calories: totals.kcal,
      proteinG: totals.protein_g,
      fatG: totals.fat_g,
      carbsG: totals.carbs_g,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', favoriteId)
    .eq('userId', userId);

  if (updateError) {
    console.error('updateFavoriteMeal: update failed', updateError);
    throw new HttpError('お気に入りを更新できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (Array.isArray(parsed.items)) {
    const { error: deleteError } = await supabaseAdmin.from('FavoriteMealItem').delete().eq('favoriteMealId', favoriteId);
    if (deleteError) {
      console.error('updateFavoriteMeal: delete items failed', deleteError);
      throw new HttpError('お気に入りを更新できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
    }
    if (parsed.items.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('FavoriteMealItem').insert(
        parsed.items.map((item, idx) => ({
          favoriteMealId: favoriteId,
          name: item.name,
          grams: item.grams,
          calories: item.calories ?? null,
          proteinG: item.protein_g ?? null,
          fatG: item.fat_g ?? null,
          carbsG: item.carbs_g ?? null,
          orderIndex: item.order_index ?? idx,
        })),
      );
      if (insertError) {
        console.error('updateFavoriteMeal: insert items failed', insertError);
        throw new HttpError('お気に入りを更新できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
      }
    }
  }

  return getFavoriteMeal(userId, favoriteId);
}

async function deleteFavoriteMeal(userId: number, favoriteId: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('FavoriteMeal')
    .delete()
    .eq('id', favoriteId)
    .eq('userId', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('deleteFavoriteMeal: delete failed', error);
    throw new HttpError('お気に入りを削除できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!data) {
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

  const { data: createdLog, error: insertLogError } = await supabaseAdmin
    .from('MealLog')
    .insert({
      userId,
      foodItem: baseResponse.dish,
      calories: baseResponse.totals.kcal,
      proteinG: baseResponse.totals.protein_g,
      fatG: baseResponse.totals.fat_g,
      carbsG: baseResponse.totals.carbs_g,
      aiRaw: aiPayload,
      zeroFloored: false,
      guardrailNotes: null,
      landingType: baseResponse.landing_type ?? null,
    })
    .select('id')
    .single();

  if (insertLogError || !createdLog) {
    console.error('logFavoriteMeal: insert meal log failed', insertLogError);
    throw new HttpError('食事記録を作成できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const logId = createdLog.id;

  const { error: historyError } = await supabaseAdmin.from('MealLogPeriodHistory').insert({
    mealLogId: logId,
    previousMealPeriod: null,
    nextMealPeriod: null,
    source: 'favorite',
  });
  if (historyError) {
    console.error('logFavoriteMeal: insert period history failed', historyError);
  }

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
    created_at: new Date(favorite.createdAt).toISOString(),
    updated_at: new Date(favorite.updatedAt).toISOString(),
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

  const { data: logsData, error } = await supabaseAdmin
    .from('MealLog')
    .select('createdAt, calories, proteinG, fatG, carbsG, mealPeriod')
    .eq('userId', params.userId)
    .is('deletedAt', null)
    .gte('createdAt', range.fromDate.toISO() ?? range.fromDate.toString())
    .lt('createdAt', range.toDate.toISO() ?? range.toDate.toString());

  if (error) {
    console.error('getDashboardSummary: failed to fetch logs', error);
    throw new HttpError('ダッシュボードを取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const logs =
    logsData?.map((row) => ({
      createdAt: new Date(row.createdAt),
      calories: row.calories,
      proteinG: row.proteinG,
      fatG: row.fatG,
      carbsG: row.carbsG,
      mealPeriod: row.mealPeriod,
    })) ?? [];

  const today = DateTime.now().setZone(DASHBOARD_TIMEZONE).startOf('day');
  const includesToday = range.fromDate <= today && range.toDate > today;

  const todayTotalsPromise = includesToday
    ? Promise.resolve(
        logs.reduce(
          (acc, log) => {
            const dayKey = DateTime.fromJSDate(log.createdAt, { zone: DASHBOARD_TIMEZONE }).startOf('day').toISODate();
            if (dayKey !== today.toISODate()) {
              return acc;
            }
            return {
              calories: acc.calories + (log.calories ?? 0),
              protein_g: acc.protein_g + (log.proteinG ?? 0),
              fat_g: acc.fat_g + (log.fatG ?? 0),
              carbs_g: acc.carbs_g + (log.carbsG ?? 0),
            };
          },
          { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
        ),
      )
    : fetchTodayTotals(params.userId, DASHBOARD_TIMEZONE);
  const dailyTargetsPromise = resolveUserTargets(params.userId);
  const [todayTotals, dailyTargets] = await Promise.all([todayTotalsPromise, dailyTargetsPromise]);
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
  const { data: profile, error } = await supabaseAdmin
    .from('UserProfile')
    .select('targetCalories, targetProteinG, targetFatG, targetCarbsG')
    .eq('userId', userId)
    .maybeSingle();

  if (error) {
    console.error('resolveUserTargets failed', error);
    throw new HttpError('目標値を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const defaults = getDefaultTargets();
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
  const { data, error } = await supabaseAdmin
    .from('MealLog')
    .select('calories, proteinG, fatG, carbsG')
    .eq('userId', userId)
    .is('deletedAt', null)
    .gte('createdAt', fromDate.toISO() ?? fromDate.toString())
    .lt('createdAt', toDate.toISO() ?? toDate.toString());

  if (error) {
    console.error('fetchTodayTotals failed', error);
    throw new HttpError('合計値を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const totals = (data ?? []).reduce(
    (acc, row) => ({
      calories: acc.calories + (row.calories ?? 0),
      proteinG: acc.proteinG + (row.proteinG ?? 0),
      fatG: acc.fatG + (row.fatG ?? 0),
      carbsG: acc.carbsG + (row.carbsG ?? 0),
    }),
    { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
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

function resolveReportSummaryParams(period: AiReportPeriod) {
  if (period === 'daily') {
    return { period: 'today' as const };
  }
  if (period === 'weekly') {
    return { period: 'thisWeek' as const };
  }
  const now = DateTime.now().setZone(DASHBOARD_TIMEZONE).startOf('day');
  const from = now.minus({ days: 29 }).toISODate() ?? now.minus({ days: 29 }).toFormat('yyyy-MM-dd');
  const to = now.toISODate() ?? now.toFormat('yyyy-MM-dd');
  return { period: 'custom' as const, from, to };
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

  const dailyEntries = days.map((day) => {
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

  const { data: rows, error } = await supabaseAdmin
    .from('MealLog')
    .select('createdAt, calories')
    .eq('userId', params.userId)
    .is('deletedAt', null)
    .gte('createdAt', startInclusive.toISO() ?? startInclusive.toString())
    .lt('createdAt', endExclusive.toISO() ?? endExclusive.toString());

  if (error) {
    console.error('buildCalorieTrend: failed to fetch meal logs', error);
    throw new HttpError('カロリートレンドを取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const bucket = new Map<string, number>();
  for (const log of rows ?? []) {
    const dt = DateTime.fromISO(String(log.createdAt), { zone: timezone });
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
  const { data: rows, error } = await supabaseAdmin
    .from('MealLog')
    .select('createdAt')
    .eq('userId', userId)
    .is('deletedAt', null)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('getUserStreak: fetch failed', error);
    throw new HttpError('食事記録を取得できませんでした', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!rows?.length) {
    return { current: 0, longest: 0, lastLoggedAt: null };
  }

  const timezone = DASHBOARD_TIMEZONE;
  const uniqueDays: DateTime[] = [];
  let lastKey: string | null = null;
  for (const log of rows) {
    const day = DateTime.fromISO(String(log.createdAt), { zone: 'utc' }).setZone(timezone).startOf('day');
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

function buildReportContext(params: { period: AiReportPeriod; summary: DashboardSummary }) {
  const daily = params.summary.calories.daily;
  const totalDays = daily.length;
  const loggedDays = daily.filter((entry) => entry.total > 0).length;
  const totalCalories = daily.reduce((acc, entry) => acc + entry.total, 0);
  const averageCalories = loggedDays > 0 ? Math.round(totalCalories / loggedDays) : 0;
  const mealPeriodTotals = daily.reduce(
    (acc, entry) => {
      acc.breakfast += entry.perMealPeriod.breakfast;
      acc.lunch += entry.perMealPeriod.lunch;
      acc.dinner += entry.perMealPeriod.dinner;
      acc.snack += entry.perMealPeriod.snack;
      acc.unknown += entry.perMealPeriod.unknown;
      return acc;
    },
    { breakfast: 0, lunch: 0, dinner: 0, snack: 0, unknown: 0 },
  );

  return {
    period: params.period,
    range: params.summary.range,
    days: {
      total: totalDays,
      logged: loggedDays,
    },
    calories: {
      total: Math.round(totalCalories),
      average: averageCalories,
    },
    macros: params.summary.macros,
    mealPeriods: mealPeriodTotals,
    daily: daily.map((entry) => ({ date: entry.date, total: entry.total })),
  };
}

function buildReportPrompt(context: ReturnType<typeof buildReportContext>, locale: Locale) {
  const preferJapanese = locale.toLowerCase().startsWith('ja');
  const languageInstruction = preferJapanese
    ? 'Use Japanese for all text fields.'
    : 'Use English (United States) for all text fields.';
  return `You are a nutrition coach. Summarize the user's eating patterns based on the JSON data.
Return ONLY valid JSON that matches this TypeScript type:
{
  "summary": { "headline": string, "score": number (0-100), "highlights": string[] },
  "metrics": Array<{ "label": string, "value": string, "note"?: string }>,
  "advice": Array<{ "priority": "high"|"medium"|"low", "title": string, "detail": string }>,
  "ingredients": Array<{ "name": string, "reason": string }>
}
Rules:
- highlights: 1-3 short bullets.
- metrics: 3-5 items, values should include units where applicable.
- advice: 1-3 items, each with a concrete action and brief reason.
- ingredients: pick about 3 ingredients (not dishes). Use macros.delta to decide focus:
  - If fat is over target, prioritize low-fat ingredients.
  - If protein is under target, prioritize high-protein ingredients.
  - If carbs are over target, prioritize low-carb ingredients.
  - Otherwise, suggest balanced, nutrient-dense ingredients.
- Never invent data that is not present in the input JSON.
${languageInstruction}
JSON input: ${JSON.stringify(context)}`;
}

function buildIngredientSuggestions(
  context: ReturnType<typeof buildReportContext>,
  locale: Locale,
): AiReportContent['ingredients'] {
  const preferJapanese = locale.toLowerCase().startsWith('ja');
  const delta = context.macros.delta;
  let focus: 'low_fat' | 'high_protein' | 'low_carb' | 'balanced' = 'balanced';

  if (delta.fat_g > 0) {
    focus = 'low_fat';
  } else if (delta.protein_g < 0) {
    focus = 'high_protein';
  } else if (delta.carbs_g > 0) {
    focus = 'low_carb';
  }

  const bank = {
    low_fat: [
      {
        name: preferJapanese ? '鶏むね肉' : 'Chicken breast',
        reason: preferJapanese ? '脂質が少なく、たんぱく質を補いやすい' : 'Low fat and easy to boost protein',
      },
      {
        name: preferJapanese ? '白身魚' : 'White fish',
        reason: preferJapanese ? '脂質が少なく、消化が軽い' : 'Lean protein with minimal fat',
      },
      {
        name: preferJapanese ? '豆腐' : 'Tofu',
        reason: preferJapanese ? '脂質を抑えつつ栄養を補える' : 'Light protein with low fat',
      },
    ],
    high_protein: [
      {
        name: preferJapanese ? 'ツナ水煮' : 'Canned tuna (in water)',
        reason: preferJapanese ? '脂質を抑えてたんぱく質を補給' : 'High protein with low fat',
      },
      {
        name: preferJapanese ? 'ギリシャヨーグルト' : 'Greek yogurt',
        reason: preferJapanese ? '手軽にたんぱく質を追加できる' : 'Easy protein boost',
      },
      {
        name: preferJapanese ? '納豆' : 'Natto',
        reason: preferJapanese ? 'たんぱく質と食物繊維を追加' : 'Adds protein and fiber',
      },
    ],
    low_carb: [
      {
        name: preferJapanese ? '葉物野菜' : 'Leafy greens',
        reason: preferJapanese ? '炭水化物を抑えながら量を増やせる' : 'Adds volume with minimal carbs',
      },
      {
        name: preferJapanese ? 'きのこ' : 'Mushrooms',
        reason: preferJapanese ? '低カロリーで満足感が出やすい' : 'Low calorie and filling',
      },
      {
        name: preferJapanese ? '白身魚' : 'White fish',
        reason: preferJapanese ? '炭水化物を増やさず栄養を補える' : 'Lean protein without carbs',
      },
    ],
    balanced: [
      {
        name: preferJapanese ? 'ブロッコリー' : 'Broccoli',
        reason: preferJapanese ? 'ビタミンと食物繊維を補える' : 'Adds vitamins and fiber',
      },
      {
        name: preferJapanese ? '豆類' : 'Legumes',
        reason: preferJapanese ? 'たんぱく質と食物繊維のバランスが良い' : 'Balanced protein and fiber',
      },
      {
        name: preferJapanese ? '玄米' : 'Brown rice',
        reason: preferJapanese ? '食物繊維が多く腹持ちが良い' : 'Whole grain for steady energy',
      },
    ],
  } as const;

  return bank[focus].slice(0, 3);
}

function buildReportMock(context: ReturnType<typeof buildReportContext>, locale: Locale): AiReportContent {
  const preferJapanese = locale.toLowerCase().startsWith('ja');
  const headline = preferJapanese ? '記録の要約' : 'Summary of your logs';
  const highlights = preferJapanese
    ? ['記録日数が少ないため傾向は控えめに評価']
    : ['Limited logs, trends are shown cautiously'];
  const metrics = preferJapanese
    ? [
        { label: '平均カロリー', value: `${context.calories.average} kcal` },
        { label: '記録日数', value: `${context.days.logged} / ${context.days.total} 日` },
        {
          label: 'P/F/C',
          value: `${Math.round(context.macros.total.protein_g)} / ${Math.round(context.macros.total.fat_g)} / ${Math.round(
            context.macros.total.carbs_g,
          )}`,
        },
      ]
    : [
        { label: 'Avg calories', value: `${context.calories.average} kcal` },
        { label: 'Logged days', value: `${context.days.logged} / ${context.days.total}` },
        {
          label: 'P/F/C',
          value: `${Math.round(context.macros.total.protein_g)} / ${Math.round(context.macros.total.fat_g)} / ${Math.round(
            context.macros.total.carbs_g,
          )}`,
        },
      ];

  const advice = preferJapanese
    ? [
        {
          priority: 'medium',
          title: '記録の継続を優先',
          detail: 'まずは1日1回の記録でデータを増やすと、より精度の高い傾向が出せます。',
        },
      ]
    : [
        {
          priority: 'medium',
          title: 'Keep logging consistently',
          detail: 'Log at least one meal per day to improve trend accuracy.',
        },
      ];

  return {
    summary: { headline, score: 70, highlights },
    metrics,
    advice,
    ingredients: buildIngredientSuggestions(context, locale),
  };
}

async function analyzeReportWithGemini(params: {
  context: ReturnType<typeof buildReportContext>;
  locale: Locale;
}): Promise<{
  report: AiReportContent;
  attemptReports: HedgeAttemptReport[];
  meta: { model: string; attempt: number; latencyMs: number; fallback_model_used?: boolean };
}> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const prompt = buildReportPrompt(params.context, params.locale);

  if (!apiKey) {
    const mock = buildReportMock(params.context, params.locale);
    return {
      report: mock,
      attemptReports: [{ model: 'mock', ok: true, latencyMs: 10, attempt: 1 }],
      meta: { model: 'mock', attempt: 1, latencyMs: 10 },
    };
  }

  const parseModelList = (raw: string | undefined) =>
    (raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  const uniqueModels = (entries: string[]) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of entries) {
      if (!seen.has(entry)) {
        seen.add(entry);
        result.push(entry);
      }
    }
    return result;
  };

  const primaryModel = (Deno.env.get('GEMINI_PRIMARY_MODEL') ?? 'models/gemini-2.5-flash').trim();
  const legacyFallbackModelRaw = (Deno.env.get('GEMINI_FALLBACK_MODEL') ?? '').trim();
  const legacyFallbackModel = legacyFallbackModelRaw && legacyFallbackModelRaw !== primaryModel ? legacyFallbackModelRaw : null;
  const fallbackModels = parseModelList(Deno.env.get('GEMINI_FALLBACK_MODELS'));
  const chainModels = parseModelList(Deno.env.get('GEMINI_MODEL_CHAIN'));
  const models = uniqueModels(
    chainModels.length ? chainModels : [primaryModel, ...fallbackModels, ...(legacyFallbackModel ? [legacyFallbackModel] : [])],
  );

  const timeoutMsCandidate = Number(Deno.env.get('GEMINI_TIMEOUT_MS') ?? '25000');
  const timeoutMs = Number.isFinite(timeoutMsCandidate) ? Math.max(1_000, timeoutMsCandidate) : 25_000;

  const isQuotaErrorMessage = (message: string) => {
    const lower = message.toLowerCase();
    return (
      message.includes('Gemini error 429') ||
      lower.includes('resource_exhausted') ||
      lower.includes('quota exceeded') ||
      lower.includes('rate limit')
    );
  };

  const buildAttemptError = (model: string, latencyMs: number, attempt: number, message: string, textLen = 0) => {
    const err = new Error(message) as Error & { report: HedgeAttemptReport };
    err.report = { model, ok: false, latencyMs, attempt, error: message, textLen };
    return err;
  };

  const extractJsonText = (text: string) => {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      return candidate;
    }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return candidate.slice(start, end + 1);
    }
    return candidate;
  };

  const normalizeIngredientList = (value: unknown): AiReportContent['ingredients'] => {
    if (!Array.isArray(value)) {
      return buildIngredientSuggestions(params.context, params.locale);
    }

    const normalized = value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const candidate = item as { name?: unknown; reason?: unknown };
        const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
        const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';
        if (!name || !reason) {
          return null;
        }
        return { name, reason };
      })
      .filter((item): item is AiReportContent['ingredients'][number] => Boolean(item));

    if (!normalized.length) {
      return buildIngredientSuggestions(params.context, params.locale);
    }
    return normalized.slice(0, 3);
  };

  const normalizeReportPayload = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return payload;
    }
    const base = payload as Record<string, unknown>;
    return {
      ...base,
      ingredients: normalizeIngredientList(base.ingredients),
    };
  };

  const parseReportContent = (candidateText: string) => {
    const jsonText = extractJsonText(candidateText);
    const parsedJson = JSON.parse(jsonText) as unknown;
    const direct = AiReportContentSchema.safeParse(parsedJson);
    if (direct.success) {
      return direct.data;
    }
    const normalized = normalizeReportPayload(parsedJson);
    const normalizedResult = AiReportContentSchema.safeParse(normalized);
    if (normalizedResult.success) {
      return normalizedResult.data;
    }
    const issues = (normalizedResult.error as any).issues ?? (normalizedResult.error as any).errors;
    const firstIssue = Array.isArray(issues) ? issues[0] : null;
    const message = firstIssue
      ? `${String(firstIssue.path?.join?.('.') ?? '')}: ${String(firstIssue.message ?? 'invalid')}`
      : normalizedResult.error.message;
    throw new Error(`Gemini response validation failed: ${message}`);
  };

  const attempt = async (model: string, attemptNumber: number) => {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`);
    url.searchParams.set('key', apiKey);

    const requestBody: Record<string, unknown> = {
      contents: [
        {
          parts: [{ text: prompt }],
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('GEMINI_TIMEOUT'), timeoutMs);
    let text = '';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      text = await resp.text();
      const latencyMs = Date.now() - started;
      if (!resp.ok) {
        throw buildAttemptError(model, latencyMs, attemptNumber, `Gemini error ${resp.status}: ${text}`, text.length);
      }
      const data = JSON.parse(text) as any;
      const first = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!first) {
        throw buildAttemptError(model, latencyMs, attemptNumber, 'Gemini returned no content');
      }
      let parsed: AiReportContent;
      try {
        parsed = parseReportContent(first);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gemini response parse failed';
        throw buildAttemptError(model, latencyMs, attemptNumber, message, first.length);
      }
      const report: HedgeAttemptReport = {
        model,
        ok: true,
        latencyMs,
        attempt: attemptNumber,
        textLen: first.length,
      };
      return { report: parsed, attemptReport: report, meta: { model, attempt: attemptNumber, latencyMs, rawText: first } };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (error instanceof Error && (error as any).report) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      throw buildAttemptError(model, latencyMs, attemptNumber, message);
    } finally {
      clearTimeout(timer);
    }
  };

  const attemptReports: HedgeAttemptReport[] = [];
  let firstError: Error | null = null;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const attemptNumber = i + 1;
    try {
      const result = await attempt(model, attemptNumber);
      attemptReports.push(result.attemptReport);
      return {
        report: result.report,
        attemptReports,
        meta: {
          model,
          attempt: attemptNumber,
          latencyMs: result.meta.latencyMs,
          fallback_model_used: attemptNumber > 1,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown AI error');
      if (!firstError) {
        firstError = err;
      }
      if ((err as any).report) {
        attemptReports.push((err as any).report);
      }
      if (isQuotaErrorMessage(err.message)) {
        throw new HttpError('AIの無料枠が上限に達しました。時間をおいて再度お試しください。', {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          code: 'AI_UPSTREAM_QUOTA',
          expose: true,
        });
      }
    }
  }

  throw firstError ?? new Error('Gemini request failed');
}

async function analyzeMeal(params: { message: string; imageBase64?: string; imageMimeType?: string; locale?: Locale }) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    const mock = buildMockResponse(params.message, params.locale ?? DEFAULT_LOCALE);
    const meta = { model: 'mock', attempt: 1, latencyMs: 10, rawText: JSON.stringify(mock) };
    return { response: mock, attemptReports: [{ model: 'mock', ok: true, latencyMs: meta.latencyMs, attempt: 1 }], meta };
  }

  const parseModelList = (raw: string | undefined) =>
    (raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  const uniqueModels = (entries: string[]) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of entries) {
      if (!seen.has(entry)) {
        seen.add(entry);
        result.push(entry);
      }
    }
    return result;
  };

  const primaryModel = (Deno.env.get('GEMINI_PRIMARY_MODEL') ?? 'models/gemini-2.5-flash').trim();
  const legacyFallbackModelRaw = (Deno.env.get('GEMINI_FALLBACK_MODEL') ?? '').trim();
  const legacyFallbackModel = legacyFallbackModelRaw && legacyFallbackModelRaw !== primaryModel ? legacyFallbackModelRaw : null;
  const fallbackModels = parseModelList(Deno.env.get('GEMINI_FALLBACK_MODELS'));
  const chainModels = parseModelList(Deno.env.get('GEMINI_MODEL_CHAIN'));
  const models = uniqueModels(
    chainModels.length ? chainModels : [primaryModel, ...fallbackModels, ...(legacyFallbackModel ? [legacyFallbackModel] : [])],
  );

  const fallbackStrategy = (Deno.env.get('GEMINI_FALLBACK_STRATEGY') ?? 'any').trim().toLowerCase();
  const textOnlyModels = new Set(parseModelList(Deno.env.get('GEMINI_TEXT_ONLY_MODELS')));
  const timeoutMsCandidate = Number(Deno.env.get('GEMINI_TIMEOUT_MS') ?? '25000');
  const timeoutMs = Number.isFinite(timeoutMsCandidate) ? Math.max(1_000, timeoutMsCandidate) : 25_000;
  const overloadRetryDelaysMs = [500, 1000, 1500];
  const overloadRetryJitterMs = 150;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const isQuotaErrorMessage = (message: string) => {
    const lower = message.toLowerCase();
    return (
      message.includes('Gemini error 429') ||
      lower.includes('resource_exhausted') ||
      lower.includes('quota exceeded') ||
      lower.includes('rate limit')
    );
  };

  const isOverloadedErrorMessage = (message: string) => {
    const lower = message.toLowerCase();
    return message.includes('Gemini error 503') || lower.includes('overloaded') || lower.includes('unavailable');
  };

  const isTimeoutError = (error: unknown) => {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const name = typeof (error as any).name === 'string' ? String((error as any).name).toLowerCase() : '';
    const message = typeof (error as any).message === 'string' ? String((error as any).message).toLowerCase() : '';
    return name.includes('abort') || message.includes('timeout') || message.includes('gemini_timeout') || message.includes('ai_attempt_timeout');
  };

  const shouldTryNextModel = (error: unknown) => {
    if (fallbackStrategy === 'any') {
      return true;
    }
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (fallbackStrategy === 'quota') {
      return isQuotaErrorMessage(message);
    }
    if (fallbackStrategy === 'quota_or_timeout') {
      return isQuotaErrorMessage(message) || isTimeoutError(error);
    }
    return true;
  };

  const isTextOnlyModel = (model: string) => {
    if (textOnlyModels.has(model)) {
      return true;
    }
    const lower = model.trim().toLowerCase();
    return lower.includes('gemma');
  };

  const hadImage = Boolean(params.imageBase64 && params.imageMimeType);
  const userMessage = (params.message ?? '').trim();

  const coerceNumberLike = (value: unknown) => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value !== 'string') {
      return value;
    }
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) {
      return value;
    }
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
      return value;
    }
    const asNumber = Number(normalized);
    return Number.isFinite(asNumber) ? asNumber : value;
  };

  const normalizeCandidatePayload = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return payload;
    }
    const root = payload as Record<string, unknown>;
    const result: Record<string, unknown> = { ...root };

    if (result.confidence !== null && result.confidence !== undefined) {
      result.confidence = coerceNumberLike(result.confidence);
    }

    const totals = root.totals;
    if (totals && typeof totals === 'object' && !Array.isArray(totals)) {
      const totalsObj = totals as Record<string, unknown>;
      result.totals = {
        ...totalsObj,
        kcal: coerceNumberLike(totalsObj.kcal),
        protein_g: coerceNumberLike(totalsObj.protein_g),
        fat_g: coerceNumberLike(totalsObj.fat_g),
        carbs_g: coerceNumberLike(totalsObj.carbs_g),
      };
    }

    if (result.items === null || result.items === undefined) {
      delete result.items;
    } else if (Array.isArray(result.items)) {
      result.items = result.items.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return item;
        }
        const itemObj = item as Record<string, unknown>;
        const normalizedItem: Record<string, unknown> = { ...itemObj, grams: coerceNumberLike(itemObj.grams) };
        for (const key of ['protein_g', 'fat_g', 'carbs_g'] as const) {
          if (normalizedItem[key] === null || normalizedItem[key] === undefined) {
            delete normalizedItem[key];
          } else {
            normalizedItem[key] = coerceNumberLike(normalizedItem[key]);
          }
        }
        return normalizedItem;
      });
    }

    if (result.warnings === null || result.warnings === undefined) {
      delete result.warnings;
    }

    return result;
  };

  const extractJsonText = (text: string) => {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      return candidate;
    }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return candidate.slice(start, end + 1);
    }
    return candidate;
  };

  const parseGeminiNutritionResponse = (candidateText: string) => {
    const jsonText = extractJsonText(candidateText);
    const parsedJson = JSON.parse(jsonText) as unknown;
    const direct = GeminiNutritionResponseSchema.safeParse(parsedJson);
    if (direct.success) {
      return direct.data;
    }

    const normalized = normalizeCandidatePayload(parsedJson);
    const normalizedParse = GeminiNutritionResponseSchema.safeParse(normalized);
    if (normalizedParse.success) {
      return normalizedParse.data;
    }

    const issues = (direct.error as any).issues ?? (direct.error as any).errors;
    const firstIssue = Array.isArray(issues) ? issues[0] : null;
    const message = firstIssue ? `${String(firstIssue.path?.join?.('.') ?? '')}: ${String(firstIssue.message ?? 'invalid')}` : direct.error.message;
    throw new Error(`Gemini response validation failed: ${message}`);
  };

  const buildAttemptError = (model: string, latencyMs: number, attempt: number, message: string, textLen = 0) => {
    const err = new Error(message) as Error & { report: HedgeAttemptReport };
    err.report = { model, ok: false, latencyMs, attempt, error: message, textLen };
    return err;
  };

  const attempt = async (model: string, attemptNumber: number, promptMessage: string, includeImage: boolean) => {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`);
    url.searchParams.set('key', apiKey);
    const prompt = buildPrompt(promptMessage, params.locale ?? DEFAULT_LOCALE);

    const requestBody: Record<string, unknown> = {
      contents: [
        {
          parts: [
            ...(includeImage && params.imageBase64 && params.imageMimeType
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('GEMINI_TIMEOUT'), timeoutMs);
    let text = '';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      text = await resp.text();
      const latencyMs = Date.now() - started;
      if (!resp.ok) {
        throw buildAttemptError(model, latencyMs, attemptNumber, `Gemini error ${resp.status}: ${text}`);
      }
      const data = JSON.parse(text) as any;
      const first = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!first) {
        throw buildAttemptError(model, latencyMs, attemptNumber, 'Gemini returned no content');
      }
      let parsed: GeminiNutritionResponse;
      try {
        parsed = parseGeminiNutritionResponse(first);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gemini response parse failed';
        throw buildAttemptError(model, latencyMs, attemptNumber, message, first.length);
      }
      const report: HedgeAttemptReport = { model, ok: true, latencyMs, attempt: attemptNumber, textLen: first.length };
      return {
        response: parsed,
        report,
        meta: { model, attempt: attemptNumber, latencyMs, rawText: first },
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (error instanceof Error && (error as any).report) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      throw buildAttemptError(model, latencyMs, attemptNumber, message);
    } finally {
      clearTimeout(timer);
    }
  };

  const attemptReports: HedgeAttemptReport[] = [];
  let firstError: Error | null = null;

  const attemptWithRetry = async (model: string, attemptNumber: number, promptMessage: string, includeImage: boolean) => {
    let lastError: Error | null = null;
    for (let retryIndex = 0; retryIndex <= overloadRetryDelaysMs.length; retryIndex += 1) {
      try {
        const result = await attempt(model, attemptNumber, promptMessage, includeImage);
        attemptReports.push(result.report);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown AI error');
        lastError = err;
        if ((err as any).report) {
          attemptReports.push((err as any).report);
        }

        const canRetry =
          retryIndex < overloadRetryDelaysMs.length && isOverloadedErrorMessage(err.message);
        if (!canRetry) {
          throw err;
        }
        const delayMs =
          overloadRetryDelaysMs[retryIndex] + Math.floor(Math.random() * overloadRetryJitterMs);
        console.warn('analyzeMeal: retrying after overload', {
          model,
          attempt: attemptNumber,
          retry: retryIndex + 1,
          delayMs,
        });
        await sleep(delayMs);
      }
    }
    throw lastError ?? new Error('Gemini request failed');
  };

  if (!models.length) {
    throw new Error('No Gemini models configured');
  }

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const attemptNumber = i + 1;
    const includeImage = hadImage && !isTextOnlyModel(model);

    if (!includeImage && hadImage && !userMessage) {
      const remainingVisionModel = models.slice(i + 1).some((candidate) => hadImage && !isTextOnlyModel(candidate));
      if (remainingVisionModel) {
        continue;
      }
      throw new HttpError('画像解析の無料枠が上限に達しました。食事内容を文章で入力して再度お試しください。', {
        status: HTTP_STATUS.TOO_MANY_REQUESTS,
        code: 'AI_IMAGE_QUOTA',
        expose: true,
      });
    }

    const promptMessage =
      !includeImage && hadImage
        ? `${userMessage}\n\n(You cannot see the attached image. Respond using only the text description.)`
        : userMessage;
    try {
      const result = await attemptWithRetry(model, attemptNumber, promptMessage, includeImage);
      if (attemptNumber > 1) {
        result.response.meta = { ...(result.response.meta ?? {}), fallback_model_used: true };
      }
      return { response: result.response, attemptReports, meta: result.meta };
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown AI error');
      if (!firstError) {
        firstError = err;
      }
      if (attemptNumber === 1 && models.length > 1) {
        console.error('analyzeMeal: primary model failed', err);
      }
      const shouldFallback = attemptNumber < models.length && shouldTryNextModel(err);
      if (!shouldFallback) {
        if (isQuotaErrorMessage(err.message)) {
          throw new HttpError('AIの無料枠が上限に達しました。時間をおいて再度お試しください。', {
            status: HTTP_STATUS.TOO_MANY_REQUESTS,
            code: 'AI_UPSTREAM_QUOTA',
            expose: true,
          });
        }
        throw err;
      }
    }
  }

  if (firstError && isQuotaErrorMessage(firstError.message)) {
    throw new HttpError('AIの無料枠が上限に達しました。時間をおいて再度お試しください。', {
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      code: 'AI_UPSTREAM_QUOTA',
      expose: true,
    });
  }

  throw firstError ?? new Error('Gemini request failed');
}

async function parseMultipart(c: Context) {
  const form = await c.req.parseBody();
  const message = typeof form['message'] === 'string' ? form['message'].trim() : '';
  const file = form['image'] instanceof File ? (form['image'] as File) : undefined;
  return { message, file };
}

function buildPrompt(userMessage: string, locale: Locale = DEFAULT_LOCALE) {
  const preferJapanese = locale.toLowerCase().startsWith('ja');
  const languageInstruction = preferJapanese
    ? 'Use Japanese for all text fields.'
    : 'Use English (United States) for all text fields.';
  return `You are a nutrition analyst. Analyze the following meal description and respond ONLY with a JSON object that matches this TypeScript type: {
  "dish": string,
  "confidence": number between 0 and 1,
  "totals": { "kcal": number, "protein_g": number, "fat_g": number, "carbs_g": number },
  "items": Array<{ "name": string, "grams": number, "protein_g"?: number, "fat_g"?: number, "carbs_g"?: number }>,
  "warnings"?: string[],
  "landing_type"?: string | null,
  "meta"?: { "model": string, "fallback_model_used"?: boolean }
}.
Numbers must be floats, never strings. Calories must be > 0 when meal is realistic. Use realistic default assumptions if unspecified. The end-user locale is ${locale}; consider locale-specific context. ${languageInstruction}
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
