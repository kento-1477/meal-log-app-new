import type { GeminiNutritionResponse, Locale } from '@meal-log/shared';
import { env } from '../env.js';
import { DEFAULT_LOCALE } from '../utils/locale.js';

export async function maybeTranslateNutritionResponse(
  base: GeminiNutritionResponse,
  targetLocale: Locale,
): Promise<GeminiNutritionResponse | null> {
  if (targetLocale === DEFAULT_LOCALE) {
    return cloneResponse(base);
  }

  const strategy = env.AI_TRANSLATION_STRATEGY ?? 'none';

  if (strategy === 'copy') {
    return cloneResponse(base);
  }

  return null;
}

function cloneResponse(payload: GeminiNutritionResponse): GeminiNutritionResponse {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}
