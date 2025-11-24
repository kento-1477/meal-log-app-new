import type { Locale } from '@shared/index.js';
import { normalizeLocale } from './locale.ts';

interface ResolveLocaleOptions {
  queryField?: string;
}

export function resolveRequestLocale(request: Request, options: ResolveLocaleOptions = {}): Locale {
  const queryField = options.queryField ?? 'locale';
  const url = new URL(request.url);
  const fromQuery = pickString(url.searchParams.get(queryField));
  const fromHeader = pickAcceptLanguage(request.headers.get('Accept-Language'));
  return normalizeLocale(fromQuery ?? fromHeader);
}

function pickString(value: string | null) {
  return value && value.trim() ? value : undefined;
}

function pickAcceptLanguage(header: string | undefined | null) {
  if (!header) {
    return undefined;
  }
  const [first] = header.split(',');
  return first?.trim() || undefined;
}
