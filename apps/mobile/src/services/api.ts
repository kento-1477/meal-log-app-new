import { API_BASE_URL } from './config';
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
} from '@meal-log/shared';
import { DashboardSummarySchema, DashboardTargetsSchema } from '@meal-log/shared';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers ?? {});

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
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
    const error = new Error(message || 'Unknown error') as ApiError;
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

  return apiFetch<MealLogResponse>('/log', {
    method: 'POST',
    body: form,
    headers: { 'Idempotency-Key': `${Date.now()}-${Math.random()}` },
  });
}

export async function getRecentLogs() {
  return apiFetch<{ ok: boolean; items: MealLogSummary[] }>('/api/logs', { method: 'GET' });
}

export async function getDailySummary(days = 7) {
  return apiFetch<{ ok: boolean; today: unknown; daily: any[] }>(`/api/logs/summary?days=${days}`);
}

export async function searchFoods(query: string) {
  return apiFetch<{ q: string; candidates: any[] }>(`/api/foods/search?q=${encodeURIComponent(query)}`);
}

export async function getMealLogDetail(logId: string) {
  return apiFetch<{ ok: boolean; item: MealLogDetail }>(`/api/log/${logId}`, { method: 'GET' });
}

export async function updateMealLog(logId: string, input: UpdateMealLogRequest) {
  return apiFetch<{ ok: boolean; item: MealLogDetail }>(`/api/log/${logId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function getMealLogShare(logId: string) {
  return apiFetch<{ ok: boolean; share: { text: string; token: string; expiresAt: string } }>(
    `/api/log/${logId}/share`,
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

  const response = await apiFetch<{ ok: boolean; summary: unknown }>(`/api/dashboard/summary?${params.toString()}`, {
    method: 'GET',
  });

  const parsed = DashboardSummarySchema.parse(response.summary);
  return parsed as DashboardSummary;
}

export async function getDashboardTargets() {
  const response = await apiFetch<{ ok: boolean; targets: unknown }>(`/api/dashboard/targets`, { method: 'GET' });
  const parsed = DashboardTargetsSchema.parse(response.targets);
  return parsed as DashboardTargets;
}

export interface StreakPayload {
  current: number;
  longest: number;
  lastLoggedAt: string | null;
}

export async function getStreak() {
  return apiFetch<{ ok: boolean; streak: StreakPayload }>(`/api/streak`, { method: 'GET' });
}
