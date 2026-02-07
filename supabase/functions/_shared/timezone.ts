import { IANAZone } from 'luxon';

const DEFAULT_TIMEZONE = Deno.env.get('DEFAULT_TIMEZONE') ?? 'UTC';

interface ResolveTimezoneOptions {
  queryField?: string;
  headerName?: string;
  fallback?: string;
}

function asValidTimezone(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return IANAZone.isValidZone(trimmed) ? trimmed : null;
}

export function normalizeTimezone(value: string | undefined | null): string {
  return asValidTimezone(value) ?? DEFAULT_TIMEZONE;
}

export function resolveRequestTimezone(request: Request, options: ResolveTimezoneOptions = {}): string {
  const queryField = options.queryField ?? 'timezone';
  const headerName = options.headerName ?? 'x-timezone';
  const fallback = options.fallback ?? DEFAULT_TIMEZONE;

  const url = new URL(request.url);
  const fromQuery = asValidTimezone(url.searchParams.get(queryField) ?? undefined);
  const fromHeader = asValidTimezone(
    request.headers.get(headerName) ?? request.headers.get('Timezone') ?? request.headers.get('X-Timezone') ?? undefined,
  );
  const fromFallback = asValidTimezone(fallback);

  return fromQuery ?? fromHeader ?? fromFallback ?? DEFAULT_TIMEZONE;
}
