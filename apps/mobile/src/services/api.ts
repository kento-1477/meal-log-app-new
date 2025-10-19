import { API_BASE_URL } from './config';
import { getLocale } from '@/i18n';
import type { NutritionCardPayload } from '@/types/chat';
import type {
  DashboardSummary,
  DashboardTargets,
  DashboardPeriod,
  MealLogDetail,
  MealLogSummary,
  UpdateMealLogRequest,
  AiUsageSummary,
  UserPlan,
  GeminiNutritionResponse,
  FavoriteMeal,
  FavoriteMealDraft,
  FavoriteMealCreateRequest,
  FavoriteMealUpdateRequest,
} from '@meal-log/shared';
import { DashboardSummarySchema, DashboardTargetsSchema } from '@meal-log/shared';

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

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

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
    return null as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
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
  plan: UserPlan;
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

  return apiFetch<MealLogResponse>('/log', {
    method: 'POST',
    body: form,
    headers: { 'Idempotency-Key': `${Date.now()}-${Math.random()}` },
  });
}

export async function getRecentLogs() {
  const locale = getLocale();
  return apiFetch<{ ok: boolean; items: MealLogSummary[] }>(appendLocale('/api/logs', locale), {
    method: 'GET',
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
