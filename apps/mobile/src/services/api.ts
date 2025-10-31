import { API_BASE_URL } from './config';
import { getLocale } from '@/i18n';
import { getDeviceTimezone } from '@/utils/timezone';
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
  FavoriteMeal,
  FavoriteMealDraft,
  FavoriteMealCreateRequest,
  FavoriteMealUpdateRequest,
  IapPurchaseRequest,
  IapPurchaseResponse,
  UserProfile,
  UpdateUserProfileRequest,
} from '@meal-log/shared';
import {
  DashboardSummarySchema,
  DashboardTargetsSchema,
  MealLogListResponseSchema,
  UserProfileResponseSchema,
  UpdateUserProfileRequestSchema,
} from '@meal-log/shared';

const responseCache = new Map<string, unknown>();

function buildCacheKey(url: string, headers: Headers) {
  const locale = headers.get('Accept-Language') ?? '';
  const timezone = headers.get('X-Timezone') ?? '';
  return `${url}::${locale}::${timezone}`;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
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

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

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
    const retry = await fetch(bustUrl, {
      ...options,
      headers: bustHeaders,
      credentials: 'include',
    });
    if (!retry.ok) {
      let message = retry.statusText;
      try {
        const data = await retry.json();
        message = (data?.error as string) ?? (data?.message as string) ?? message;
      } catch (_e) {
        // ignore json parse errors
      }
      const error = new Error(message || '不明なエラーが発生しました') as ApiError;
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
    const error = new Error(message || '不明なエラーが発生しました') as ApiError;
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
}

export interface SessionPayload {
  authenticated: boolean;
  user?: SessionUser;
  usage?: AiUsageSummary;
}

export interface AuthResponse {
  message: string;
  user: SessionUser;
  usage: AiUsageSummary;
}

export async function registerUser(input: { email: string; password: string; username?: string }) {
  return apiFetch<AuthResponse>('/api/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function login(input: { email: string; password: string }) {
  return apiFetch<AuthResponse>('/api/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function logout() {
  await apiFetch<{ message: string }>('/api/logout', { method: 'POST' });
}

export async function getSession() {
  try {
    return await apiFetch<SessionPayload>('/api/session', { method: 'GET' });
  } catch (_error) {
    return { authenticated: false } satisfies SessionPayload;
  }
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

export async function postMealLog(params: { message: string; imageUri?: string | null }) {
  const form = new FormData();
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
    headers: { 'Idempotency-Key': `${Date.now()}-${Math.random()}` },
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

export async function updateUserProfile(input: UpdateUserProfileRequest) {
  const payload = UpdateUserProfileRequestSchema.parse(input);
  const response = await apiFetch<{ ok: boolean; profile: unknown }>(
    '/api/profile',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
  const parsed = UserProfileResponseSchema.parse(response);
  return parsed.profile as UserProfile;
}

export async function deleteAccount() {
  return apiFetch<{ ok: boolean }>('/api/account', { method: 'DELETE' });
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
  return apiFetch('/api/user/premium-status', { method: 'GET' });
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
