import { Platform } from 'react-native';
import { API_BASE_URL } from './config';
import { clearSessionCookie, getSessionCookie, saveSessionCookie } from './sessionStorage';
import type { NutritionCardPayload } from '@/types/chat';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers ?? {});
  const cookie = await getSessionCookie();

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: Platform.OS === 'web' ? 'include' : undefined,
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    await saveSessionCookie(extractCookie(setCookie));
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = data?.error ?? data?.message ?? message;
    } catch (error) {
      // ignore json parse errors
    }
    throw new Error(message || 'Unknown error');
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export async function registerUser(input: { email: string; password: string; username?: string }) {
  return apiFetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function login(input: { email: string; password: string }) {
  return apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function logout() {
  await apiFetch<{ message: string }>('/api/logout', { method: 'POST' });
  await clearSessionCookie();
}

export async function getSession() {
  try {
    return await apiFetch<{ authenticated: boolean; user?: { id: number; email: string; username?: string } }>(
      '/api/session',
      { method: 'GET' },
    );
  } catch (error) {
    return { authenticated: false };
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
  return apiFetch<{ ok: boolean; items: any[] }>('/api/logs', { method: 'GET' });
}

export async function getDailySummary(days = 7) {
  return apiFetch<{ ok: boolean; today: unknown; daily: any[] }>(`/api/logs/summary?days=${days}`);
}

export async function searchFoods(query: string) {
  return apiFetch<{ q: string; candidates: any[] }>(`/api/foods/search?q=${encodeURIComponent(query)}`);
}

function extractCookie(raw: string) {
  return raw.split(',')[0].split(';')[0];
}
