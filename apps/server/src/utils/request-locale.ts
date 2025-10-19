import type { Request } from 'express';
import type { Locale } from '@meal-log/shared';
import { normalizeLocale } from './locale.js';

interface ResolveLocaleOptions {
  bodyField?: string;
  queryField?: string;
}

export function resolveRequestLocale(req: Request, options: ResolveLocaleOptions = {}): Locale {
  const bodyField = options.bodyField ?? 'locale';
  const queryField = options.queryField ?? 'locale';

  const fromBody = pickString(req.body?.[bodyField]);
  const fromQuery = pickString((req.query as Record<string, unknown> | undefined)?.[queryField]);
  const fromSession = pickString(req.session?.locale);
  const fromHeader = pickAcceptLanguage(req.get('Accept-Language'));

  return normalizeLocale(fromBody ?? fromQuery ?? fromSession ?? fromHeader);
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function pickAcceptLanguage(header: string | undefined | null) {
  if (!header) {
    return undefined;
  }
  const [first] = header.split(',');
  return first?.trim() || undefined;
}
