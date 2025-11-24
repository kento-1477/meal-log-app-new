import { LocaleSchema, MealLogAiRawSchema, GeminiNutritionResponseSchema, type GeminiNutritionResponse, type Locale, type MealLogAiRaw } from '@shared/index.js';

export const DEFAULT_LOCALE: Locale = 'en-US';
export const SECONDARY_FALLBACK_LOCALE: Locale = 'ja-JP';

const UNIQUE_LOCALE = (list: Locale[], locale: Locale) => {
  if (!list.includes(locale)) {
    list.push(locale);
  }
};

export function normalizeLocale(value?: string | null): Locale {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_LOCALE;
  }
  const normalized = trimmed
    .replace(/_/g, '-')
    .split('-')
    .map((segment, index) => {
      if (index === 0) {
        return segment.toLowerCase();
      }
      if (segment.length === 2) {
        return segment.toUpperCase();
      }
      return segment;
    })
    .join('-');

  const parsed = LocaleSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }
  return DEFAULT_LOCALE;
}

export interface LocalizationResolution {
  requestedLocale: Locale;
  resolvedLocale: Locale;
  translations: Record<Locale, GeminiNutritionResponse>;
  translation: GeminiNutritionResponse | null;
  fallbackApplied: boolean;
}

export function resolveMealLogLocalization(raw: unknown, preferredLocale?: string | null): LocalizationResolution {
  const requestedLocale = normalizeLocale(preferredLocale);
  const translations = collectTranslations(raw);
  const aiRaw = parseMealLogAiRaw(raw);

  const fallbackOrder = buildFallbackOrder({ requestedLocale, aiRaw, translations });

  for (const locale of fallbackOrder) {
    const translation = translations[locale];
    if (translation) {
      return {
        requestedLocale,
        resolvedLocale: locale,
        translations,
        translation,
        fallbackApplied: locale !== requestedLocale,
      };
    }
  }

  const firstEntry = Object.entries(translations)[0];
  if (firstEntry) {
    const [locale, translation] = firstEntry as [Locale, GeminiNutritionResponse];
    return {
      requestedLocale,
      resolvedLocale: locale,
      translations,
      translation,
      fallbackApplied: locale !== requestedLocale,
    };
  }

  return {
    requestedLocale,
    resolvedLocale: DEFAULT_LOCALE,
    translations,
    translation: null,
    fallbackApplied: requestedLocale !== DEFAULT_LOCALE,
  };
}

interface LocaleOrderContext {
  requestedLocale: Locale;
  aiRaw: MealLogAiRaw | null;
  translations: Record<Locale, GeminiNutritionResponse>;
}

function buildFallbackOrder({ requestedLocale, aiRaw, translations }: LocaleOrderContext): Locale[] {
  const order: Locale[] = [];
  UNIQUE_LOCALE(order, requestedLocale);

  if (aiRaw?.locale) {
    UNIQUE_LOCALE(order, normalizeLocale(aiRaw.locale));
  }

  UNIQUE_LOCALE(order, SECONDARY_FALLBACK_LOCALE);
  UNIQUE_LOCALE(order, DEFAULT_LOCALE);

  for (const locale of Object.keys(translations)) {
    UNIQUE_LOCALE(order, normalizeLocale(locale));
  }

  return order;
}

export function collectTranslations(raw: unknown): Record<Locale, GeminiNutritionResponse> {
  const translations: Record<Locale, GeminiNutritionResponse> = {};
  const parsed = parseMealLogAiRaw(raw);

  if (parsed?.translations) {
    for (const [locale, value] of Object.entries(parsed.translations)) {
      const parsedLocale = normalizeLocale(locale);
      const parsedValue = GeminiNutritionResponseSchema.safeParse(value);
      if (parsedValue.success) {
        translations[parsedLocale] = parsedValue.data;
      }
    }
  }

  if (parsed) {
    const baseLocale = parsed.locale ? normalizeLocale(parsed.locale) : DEFAULT_LOCALE;
    const baseCandidate = {
      dish: parsed.dish,
      confidence: parsed.confidence,
      totals: parsed.totals,
      items: parsed.items ?? [],
      warnings: parsed.warnings ?? [],
      landing_type: parsed.landing_type ?? null,
      meta: parsed.meta,
    } satisfies Partial<GeminiNutritionResponse>;
    const parsedBase = GeminiNutritionResponseSchema.safeParse(baseCandidate);
    if (parsedBase.success && !translations[baseLocale]) {
      translations[baseLocale] = parsedBase.data;
    }
  } else {
    const fallback = GeminiNutritionResponseSchema.safeParse(raw);
    if (fallback.success) {
      translations[DEFAULT_LOCALE] = fallback.data;
    }
  }

  return translations;
}

export function parseMealLogAiRaw(raw: unknown): MealLogAiRaw | null {
  const parsed = MealLogAiRawSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
