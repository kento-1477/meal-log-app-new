import type { Request } from 'express';
import { IANAZone } from 'luxon';
import { DASHBOARD_TIMEZONE } from '../config/dashboard.js';

interface ResolveTimezoneOptions {
  bodyField?: string;
  queryField?: string;
  headerName?: string;
  fallback?: string;
}

const DEFAULT_TIMEZONE = DASHBOARD_TIMEZONE ?? 'UTC';

export function resolveRequestTimezone(req: Request, options: ResolveTimezoneOptions = {}): string {
  const bodyField = options.bodyField ?? 'timezone';
  const queryField = options.queryField ?? 'timezone';
  const headerName = options.headerName ?? 'x-timezone';
  const fallback = options.fallback ?? DEFAULT_TIMEZONE;

  const fromBody = pickString(req.body?.[bodyField]);
  const fromQuery = pickString((req.query as Record<string, unknown> | undefined)?.[queryField]);
  const fromSession = pickString(req.session?.timezone);
  const fromHeader = pickString(req.get(headerName) ?? req.get('Timezone') ?? req.get('X-Timezone'));

  return normalizeTimezone(fromBody ?? fromQuery ?? fromSession ?? fromHeader ?? fallback);
}

export function normalizeTimezone(value: string | undefined | null): string {
  if (!value) {
    return DEFAULT_TIMEZONE;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_TIMEZONE;
  }
  return IANAZone.isValidZone(trimmed) ? trimmed : DEFAULT_TIMEZONE;
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
