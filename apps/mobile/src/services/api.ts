import { API_BASE_URL } from './config';
import Constants from 'expo-constants';
import { z } from 'zod';
import { getLocale, translateKey } from '@/i18n';
import { getDeviceTimezone } from '@/utils/timezone';
import { getDeviceFingerprintId } from '@/services/device-fingerprint';
import type { NutritionCardPayload } from '@/types/chat';
import type {
  DashboardSummary,
  DashboardTargets,
  DashboardPeriod,
  MealLogDetail,
  MealLogRange,
  MealLogListResponse,
  UpdateMealLogRequest,
  AiUsageSummary,
  GeminiNutritionResponse,
  AiReportPeriod,
  AiReportApiResponse,
  FavoriteMeal,
  FavoriteMealDraft,
  FavoriteMealCreateRequest,
  FavoriteMealUpdateRequest,
  IapPurchaseRequest,
  IapPurchaseResponse,
  UserProfile,
  UpdateUserProfileRequest,
  OnboardingStatus,
  NotificationSettings,
  NotificationSettingsUpdateRequest,
  PushTokenRegisterRequest,
  PushTokenDisableRequest,
} from '@meal-log/shared';
import {
  DashboardSummarySchema,
  DashboardTargetsSchema,
  MealLogListResponseSchema,
  UserProfileResponseSchema,
  UpdateUserProfileRequestSchema,
  CalorieTrendResponseSchema,
  AiReportApiResponseSchema,
  NotificationSettingsResponseSchema,
  NotificationSettingsUpdateRequestSchema,
  PushTokenRegisterRequestSchema,
  PushTokenDisableRequestSchema,
} from '@meal-log/shared';

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_IMPLEMENTED: 501,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

const responseCache = new Map<string, unknown>();
const LOG_TIMEOUT_MS = 30_000;
const IMAGE_LOG_TIMEOUT_MS = 30_000;
const JAPANESE_CHAR_REGEX = /[ぁ-んァ-ヶ一-龯]/;
const APP_VERSION =
  Constants.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;

function isJapaneseText(value: string) {
  return JAPANESE_CHAR_REGEX.test(value);
}

function getApiFallbackMessage(status: number | undefined, locale: string) {
  const fallbackMessages: Record<number, string> = {
    [HTTP_STATUS.UNAUTHORIZED]: translateKey('api.error.unauthorized', undefined, locale),
    [HTTP_STATUS.FORBIDDEN]: translateKey('api.error.forbidden', undefined, locale),
    [HTTP_STATUS.NOT_FOUND]: translateKey('api.error.notFound', undefined, locale),
    [HTTP_STATUS.BAD_REQUEST]: translateKey('api.error.badRequest', undefined, locale),
    [HTTP_STATUS.TOO_MANY_REQUESTS]: translateKey('api.error.tooManyRequests', undefined, locale),
    [HTTP_STATUS.INTERNAL_ERROR]: translateKey('api.error.internal', undefined, locale),
    [HTTP_STATUS.NOT_IMPLEMENTED]: translateKey('api.error.notImplemented', undefined, locale),
  };
  return fallbackMessages[status ?? -1] ?? translateKey('api.error.unknown', undefined, locale);
}

function resolveApiErrorMessage(
  rawMessage: string | undefined,
  status: number | undefined,
  statusText: string | undefined,
  locale: string,
) {
  const fallback = getApiFallbackMessage(status, locale);
  if (!rawMessage || (statusText && rawMessage === statusText)) {
    return fallback;
  }
  const uiIsJapanese = locale.toLowerCase().startsWith('ja');
  const messageHasJapanese = isJapaneseText(rawMessage);
  const shouldUseRaw = uiIsJapanese ? messageHasJapanese : !messageHasJapanese;
  return shouldUseRaw ? rawMessage : fallback;
}

function resolveFunctionPrefix(path: string): string {
  // Supabase Edge Functions are exposed under /{function-name}/...
  if (
    path.startsWith('/api/login/apple') ||
    path.startsWith('/api/session') ||
    path.startsWith('/api/logout')
  ) {
    return '/auth';
  }

  if (path.startsWith('/api/iap')) {
    return '/iap';
  }

  if (path.startsWith('/api/referral')) {
    return '/referral';
  }

  if (path.startsWith('/api/ai')) {
    return '/ai';
  }

  // Default: meal-log domain (logs, dashboard, favorites, etc.)
  return '/meal-log';
}

function shouldUseFunctionPrefix(baseUrl: string): boolean {
  return baseUrl.includes('.functions.supabase.co') || baseUrl.includes('/functions/');
}

function buildApiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const prefix = shouldUseFunctionPrefix(base) ? resolveFunctionPrefix(path) : '';
  return `${base}${prefix}${path}`;
}

function buildCacheKey(url: string, headers: Headers) {
  const locale = headers.get('Accept-Language') ?? '';
  const timezone = headers.get('X-Timezone') ?? '';
  return `${url}::${locale}::${timezone}`;
}

type ApiFetchOptions = RequestInit & { timeoutMs?: number };

export type OnboardingEventPayload = {
  eventName: 'onboarding.step_viewed' | 'onboarding.step_completed' | 'onboarding.completed';
  step?: string | null;
  sessionId: string;
  metadata?: Record<string, unknown> | null;
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined' || init.signal) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const url = buildApiUrl(path);
  const { timeoutMs = 60_000, ...fetchOptions } = options;
  const headers = new Headers(options.headers ?? {});

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const appLocale = getLocale();
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', appLocale);
  }

  if (!headers.has('X-Timezone')) {
    headers.set('X-Timezone', getDeviceTimezone());
  }

  if (!headers.has('X-Device-Id')) {
    headers.set('X-Device-Id', await getDeviceFingerprintId());
  }
  if (!headers.has('X-App-Version') && APP_VERSION) {
    headers.set('X-App-Version', APP_VERSION);
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        ...fetchOptions,
        headers,
        credentials: 'include',
      },
      timeoutMs,
    );
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      const error = new Error(translateKey('api.error.timeout', undefined, appLocale)) as ApiError;
      error.code = 'network.timeout';
      throw error;
    }
    throw err;
  }

  const method = (options.method ?? 'GET').toUpperCase();
  const cacheKey = buildCacheKey(url, headers);

  if (response.status === 304 && method === 'GET') {
    if (responseCache.has(cacheKey)) {
      return responseCache.get(cacheKey) as T;
    }
    // No cached value available. Retry once with a cache-busting query to force a fresh 200 response.
    const bustUrl = `${url}${url.includes('?') ? '&' : '?'}__bust=${Date.now()}`;
    const bustHeaders = new Headers(headers);
    bustHeaders.delete('If-None-Match');
    bustHeaders.delete('if-none-match');
    bustHeaders.delete('If-Modified-Since');
    bustHeaders.delete('if-modified-since');
    let retry: Response;
    try {
      retry = await fetchWithTimeout(
        bustUrl,
        {
          ...fetchOptions,
          headers: bustHeaders,
          credentials: 'include',
        },
        timeoutMs,
      );
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        const error = new Error(translateKey('api.error.timeout', undefined, appLocale)) as ApiError;
        error.code = 'network.timeout';
        throw error;
      }
      throw err;
    }
    if (!retry.ok) {
      let message = retry.statusText;
      try {
        const data = await retry.json();
        message = (data?.error as string) ?? (data?.message as string) ?? message;
      } catch (_e) {
        // ignore json parse errors
      }
      const resolvedMessage = resolveApiErrorMessage(message, retry.status, retry.statusText, appLocale);
      const error = new Error(resolvedMessage) as ApiError;
      error.status = retry.status;
      throw error;
    }
    if (retry.status === 204) {
      return null as T;
    }
    const retryText = await retry.text();
    const retryParsed = retryText ? (JSON.parse(retryText) as T) : (null as T);
    // Store under the original (non-busted) cache key
    responseCache.set(cacheKey, retryParsed);
    return retryParsed;
  }

  if (!response.ok) {
    let message = response.statusText;
    let data: Record<string, unknown> | null = null;
    try {
      data = await response.json();
      message = (data?.error as string) ?? (data?.message as string) ?? message;
    } catch (_error) {
      // ignore json parse errors
    }
    const resolvedMessage = resolveApiErrorMessage(message, response.status, response.statusText, appLocale);
    const error = new Error(resolvedMessage) as ApiError;
    error.status = response.status;
    if (data && typeof data === 'object') {
      if (typeof data.code === 'string') {
        error.code = data.code;
      }
      if (data.data) {
        error.data = data.data;
      }
    }
    throw error;
  }

  if (response.status === 204) {
    if (method !== 'GET') {
      responseCache.delete(cacheKey);
    }
    return null as T;
  }

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T) : (null as T);

  if (method === 'GET') {
    responseCache.set(cacheKey, parsed);
  } else {
    responseCache.delete(cacheKey);
  }

  return parsed;
}

function appendLocale(path: string, locale: string): string {
  if (!locale) {
    return path;
  }

  const [base, hashFragment] = path.split('#');
  const url = new URL(base, 'https://api.local');
  url.searchParams.set('locale', locale);
  const search = url.search ? url.search : '';
  const localizedPath = `${url.pathname}${search}`;
  return hashFragment ? `${localizedPath}#${hashFragment}` : localizedPath;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  data?: unknown;
}

export interface SessionUser {
  id: number;
  email: string;
  username?: string;
  aiCredits: number;
  appleLinked?: boolean;
  appleEmail?: string | null;
}

export interface SessionPayload {
  authenticated: boolean;
  user?: SessionUser;
  usage?: AiUsageSummary;
  onboarding?: OnboardingStatus;
}

export interface AuthResponse {
  message: string;
  user: SessionUser;
  usage: AiUsageSummary;
  onboarding: OnboardingStatus;
}

export async function signInWithApple(input: { identityToken: string; authorizationCode?: string; email?: string; fullName?: string }) {
  if (__DEV__) {
    console.log('[API] signInWithApple called, API_BASE_URL:', API_BASE_URL);
  }
  return apiFetch<AuthResponse>('/api/login/apple', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function logout() {
  await apiFetch<{ message: string }>('/api/logout', { method: 'POST' });
}

export async function getSession() {
  return apiFetch<SessionPayload>('/api/session', { method: 'GET' });
}

export interface MealLogResponse {
  ok: boolean;
  success: boolean;
  logId: string;
  dish: string;
  confidence: number;
  totals: NutritionCardPayload['totals'];
  items: NutritionCardPayload['items'];
  breakdown: { warnings: string[]; items: NutritionCardPayload['items'] };
  meta: Record<string, unknown>;
  meal_period?: string | null;
  image_url?: string | null;
  usage?: AiUsageSummary;
  requestLocale: string;
  locale: string;
  fallbackApplied: boolean;
  translations?: Record<string, GeminiNutritionResponse>;
  favoriteCandidate: FavoriteMealDraft;
}

export type IngestStatusResponse =
  | { ok: true; status: 'processing'; requestKey: string; createdAt: string | null }
  | {
      ok: true;
      status: 'deferred';
      requestKey: string;
      createdAt: string | null;
      nextCheckAt: string | null;
      deadlineAt: string | null;
    }
  | {
      ok: true;
      status: 'failed';
      requestKey: string;
      createdAt: string | null;
      errorCode: string | null;
      errorCategory: 'waitable' | 'actionable' | null;
      message: string | null;
    }
  | { ok: true; status: 'done'; requestKey: string; result: MealLogResponse };

export async function getIngestStatus(requestKey: string) {
  const encoded = encodeURIComponent(requestKey);
  if (__DEV__) {
    console.log('[API] getIngestStatus', { requestKey });
  }
  return apiFetch<IngestStatusResponse>(`/api/ingest/${encoded}`, { method: 'GET' });
}

export async function postMealLog(params: { message: string; imageUri?: string | null; idempotencyKey?: string }) {
  const form = new FormData();
  const hasImage = Boolean(params.imageUri);
  if (params.message) {
    form.append('message', params.message);
  }
  if (params.imageUri) {
    const fileName = params.imageUri.split('/').pop() ?? 'meal.jpg';
    const file: any = {
      uri: params.imageUri,
      name: fileName,
      type: 'image/jpeg',
    };
    form.append('image', file);
  }

  form.append('locale', getLocale());
  form.append('timezone', getDeviceTimezone());

  return apiFetch<MealLogResponse>('/log', {
    method: 'POST',
    body: form,
    headers: {
      'Idempotency-Key': params.idempotencyKey ?? `${Date.now()}-${Math.random()}`,
      'X-Translation-Mode': 'defer',
    },
    timeoutMs: hasImage ? IMAGE_LOG_TIMEOUT_MS : LOG_TIMEOUT_MS,
  });
}

function buildLogsPath(params: { range?: MealLogRange; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params.range) {
    searchParams.set('range', params.range);
  }
  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }
  if (typeof params.offset === 'number') {
    searchParams.set('offset', String(params.offset));
  }
  const query = searchParams.toString();
  return `/api/logs${query ? `?${query}` : ''}`;
}

export async function getMealLogs(options: { range?: MealLogRange; limit?: number; offset?: number } = {}) {
  const locale = getLocale();
  const path = buildLogsPath(options);
  const raw = await apiFetch<unknown>(appendLocale(path, locale), { method: 'GET' });
  const parsed = MealLogListResponseSchema.parse(raw);
  return parsed as MealLogListResponse;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const raw = await apiFetch<unknown>('/api/notifications/settings', { method: 'GET' });
  const parsed = NotificationSettingsResponseSchema.parse(raw);
  return parsed.settings;
}

export async function updateNotificationSettings(
  payload: NotificationSettingsUpdateRequest,
): Promise<NotificationSettings> {
  NotificationSettingsUpdateRequestSchema.parse(payload);
  const raw = await apiFetch<unknown>('/api/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  const parsed = NotificationSettingsResponseSchema.parse(raw);
  return parsed.settings;
}

export async function registerPushToken(payload: PushTokenRegisterRequest) {
  PushTokenRegisterRequestSchema.parse(payload);
  return apiFetch<{ ok: true }>('/api/notifications/token', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function disablePushToken(payload: PushTokenDisableRequest) {
  PushTokenDisableRequestSchema.parse(payload);
  return apiFetch<{ ok: true }>('/api/notifications/token', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export async function getRecentLogs() {
  return getMealLogs({ limit: 20 });
}

export async function getUserProfile() {
  const response = await apiFetch<{ ok: boolean; profile: unknown }>(
    '/api/profile',
    { method: 'GET' },
  );
  const parsed = UserProfileResponseSchema.parse(response);
  return parsed.profile as UserProfile;
}

export async function updateUserProfile(input: UpdateUserProfileRequest): Promise<z.infer<typeof UserProfileResponseSchema>> {
  const payload = UpdateUserProfileRequestSchema.parse(input);
  const response = await apiFetch<z.infer<typeof UserProfileResponseSchema>>(
    '/api/profile',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
  const parsed = UserProfileResponseSchema.parse(response);
  return parsed;
}

export async function deleteAccount() {
  return apiFetch<{ ok: boolean }>('/api/user/account', { method: 'DELETE' });
}

export async function claimReferralCodeApi(code: string) {
  return apiFetch<{ ok: boolean; premiumDays: number; premiumUntil: string; referrerUsername: string | null }>(
    '/api/referral/claim',
    {
      method: 'POST',
      body: JSON.stringify({ code }),
    },
  );
}

export async function postOnboardingEvent(payload: OnboardingEventPayload) {
  return apiFetch<{ ok: boolean }>('/api/onboarding/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getDailySummary(days = 7) {
  const locale = getLocale();
  return apiFetch<{ ok: boolean; today: unknown; daily: any[] }>(
    appendLocale(`/api/logs/summary?days=${days}`, locale),
  );
}

export async function searchFoods(query: string) {
  const locale = getLocale();
  return apiFetch<{ q: string; candidates: any[] }>(
    appendLocale(`/api/foods/search?q=${encodeURIComponent(query)}`, locale),
  );
}

export async function getMealLogDetail(logId: string) {
  const locale = getLocale();
  return apiFetch<{ ok: boolean; item: MealLogDetail }>(appendLocale(`/api/log/${logId}`, locale), {
    method: 'GET',
  });
}

export async function translateMealLog(logId: string) {
  const locale = getLocale();
  return apiFetch<MealLogResponse>(appendLocale(`/api/log/${logId}/translate`, locale), {
    method: 'POST',
  });
}

export async function updateMealLog(logId: string, input: UpdateMealLogRequest) {
  const locale = getLocale();
  return apiFetch<{ ok: boolean; item: MealLogDetail }>(appendLocale(`/api/log/${logId}`, locale), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function getMealLogShare(logId: string) {
  const locale = getLocale();
  return apiFetch<{ ok: boolean; share: { text: string; token: string; expiresAt: string } }>(
    appendLocale(`/api/log/${logId}/share`, locale),
    {
      method: 'GET',
    },
  );
}

export type ExportRange = 'day' | 'week' | 'month';

export async function getLogsExport(range: ExportRange, anchor?: string) {
  const params = new URLSearchParams({ range });
  if (anchor) {
    params.set('anchor', anchor);
  }
  params.set('locale', getLocale());

  return apiFetch<{
    ok: boolean;
    range: ExportRange;
    export: {
      from: string;
      to: string;
      items: Array<{
        id: string;
        recordedAt: string;
        foodItem: string;
        calories: number;
        proteinG: number;
        fatG: number;
        carbsG: number;
        mealPeriod: string | null;
        locale: string;
        requestedLocale: string;
        fallbackApplied: boolean;
      }>;
    };
  }>(`/api/logs/export?${params.toString()}`, { method: 'GET' });
}

export async function getDashboardSummary(period: DashboardPeriod, range?: { from: string; to: string }) {
  const params = new URLSearchParams({ period });
  if (period === 'custom' && range) {
    params.set('from', range.from);
    params.set('to', range.to);
  }
  params.set('locale', getLocale());

  const response = await apiFetch<{ ok: boolean; summary: unknown }>(`/api/dashboard/summary?${params.toString()}`, {
    method: 'GET',
  });

  const parsed = DashboardSummarySchema.parse(response.summary);
  return parsed as DashboardSummary;
}

export async function getDashboardTargets() {
  const response = await apiFetch<{ ok: boolean; targets: unknown }>(
    appendLocale(`/api/dashboard/targets`, getLocale()),
    { method: 'GET' },
  );
  const parsed = DashboardTargetsSchema.parse(response.targets);
  return parsed as DashboardTargets;
}

export async function createAiReport(period: AiReportPeriod) {
  const response = await apiFetch<unknown>('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ period }),
  });
  const parsed = AiReportApiResponseSchema.parse(response);
  return parsed as AiReportApiResponse;
}

export type CalorieTrendMode = 'daily' | 'weekly' | 'monthly';

export async function getCalorieTrend(mode: CalorieTrendMode) {
  const params = new URLSearchParams({ mode });
  params.set('locale', getLocale());
  const response = await apiFetch<{ ok: boolean; target: unknown; points: unknown[] }>(
    `/api/calories?${params.toString()}`,
    { method: 'GET' },
  );
  const parsed = CalorieTrendResponseSchema.parse({ target: response.target, points: response.points });
  return parsed;
}

export interface StreakPayload {
  current: number;
  longest: number;
  lastLoggedAt: string | null;
}

export async function getStreak() {
  return apiFetch<{ ok: boolean; streak: StreakPayload }>(appendLocale(`/api/streak`, getLocale()), {
    method: 'GET',
  });
}

export async function getFavorites() {
  return apiFetch<{ ok: boolean; items: FavoriteMeal[] }>('/api/favorites', { method: 'GET' });
}

export async function getFavoriteDetail(favoriteId: number) {
  return apiFetch<{ ok: boolean; item: FavoriteMeal }>(`/api/favorites/${favoriteId}`, { method: 'GET' });
}

export async function createFavoriteMeal(payload: FavoriteMealCreateRequest) {
  return apiFetch<{ ok: boolean; item: FavoriteMeal }>('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateFavoriteMeal(favoriteId: number, payload: FavoriteMealUpdateRequest) {
  return apiFetch<{ ok: boolean; item: FavoriteMeal }>(`/api/favorites/${favoriteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteFavoriteMeal(favoriteId: number) {
  await apiFetch<void>(`/api/favorites/${favoriteId}`, { method: 'DELETE' });
}

export async function createLogFromFavorite(favoriteId: number) {
  return apiFetch<MealLogResponse>(`/api/favorites/${favoriteId}/log`, {
    method: 'POST',
  });
}

export async function deleteMealLogEntry(logId: string) {
  return apiFetch<{ ok: boolean; deletedAt: string | null }>(`/api/log/${logId}`, {
    method: 'DELETE',
  });
}

export async function restoreMealLogEntry(logId: string) {
  return apiFetch<{ ok: boolean }>(`/api/log/${logId}/restore`, {
    method: 'POST',
  });
}

export async function submitIapPurchase(payload: IapPurchaseRequest) {
  return apiFetch<IapPurchaseResponse>('/api/iap/purchase', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 75_000,
  });
}

export async function purchasePremium(payload: IapPurchaseRequest) {
  return submitIapPurchase(payload);
}

// Referral API
export interface ReferralInviteLinkResponse {
  inviteLink: string;
  webLink: string;
  code: string;
  message: string;
}

export async function generateInviteLink(): Promise<ReferralInviteLinkResponse> {
  return apiFetch('/api/referral/invite-link', {
    method: 'POST',
    body: JSON.stringify({ timezone: getDeviceTimezone() }),
  });
}

// Premium Status API
export interface PremiumStatusResponse {
  isPremium: boolean;
  source: 'REFERRAL_FRIEND' | 'REFERRAL_REFERRER' | 'PURCHASE' | 'ADMIN_GRANT' | null;
  daysRemaining: number;
  expiresAt: string | null;
  grants: Array<{
    source: 'REFERRAL_FRIEND' | 'REFERRAL_REFERRER' | 'PURCHASE' | 'ADMIN_GRANT';
    days: number;
    startDate: string;
    endDate: string;
    createdAt?: string;
  }>;
}

export async function getPremiumStatus(): Promise<PremiumStatusResponse> {
  return apiFetch('/api/user/premium-status', { method: 'GET', timeoutMs: 20_000 });
}

// Referral Status API
export interface ReferralStatusResponse {
  inviteCode: string;
  inviteLink: string;
  stats: {
    totalReferred: number;
    completedReferred: number;
    pendingReferred: number;
    totalPremiumDaysEarned: number;
  };
  recentReferrals: Array<{
    friendUsername: string;
    status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
    consecutiveDays: number;
    createdAt: string;
    completedAt?: string;
  }>;
}

export async function getReferralStatus(): Promise<ReferralStatusResponse> {
  return apiFetch('/api/referral/my-status', { method: 'GET' });
}
