import { IANAZone } from 'luxon';

const DEFAULT_TIMEZONE = Deno.env.get('DEFAULT_TIMEZONE') ?? 'UTC';

interface ResolveTimezoneOptions {
  queryField?: string;
  headerName?: string;
  fallback?: string;
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

export function resolveRequestTimezone(request: Request, options: ResolveTimezoneOptions = {}): string {
  const queryField = options.queryField ?? 'timezone';
  const headerName = options.headerName ?? 'x-timezone';
  const fallback = options.fallback ?? DEFAULT_TIMEZONE;

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get(queryField) ?? undefined;
  const fromHeader = request.headers.get(headerName) ?? request.headers.get('Timezone') ?? request.headers.get('X-Timezone') ?? undefined;

  return normalizeTimezone(fromQuery ?? fromHeader ?? fallback);
}
