import { z } from 'zod';
import { LocaleSchema, MealLogAiRawSchema, GeminiNutritionResponseSchema, type GeminiNutritionResponse, type Locale, type MealLogAiRaw } from '@shared/index.js';
import { getEnv } from './env.ts';

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

// ---- Translation helpers ----

const TranslationResultSchema = z.object({
  locale: LocaleSchema,
  dish: z.string(),
  items: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      name: z.string(),
    }),
  ),
  warnings: z.array(z.string()).optional(),
});

type TranslationResult = z.infer<typeof TranslationResultSchema>;

const translationTimeoutMs = Number(Deno.env.get('AI_ATTEMPT_TIMEOUT_MS') ?? 25000);
const translationStrategyRaw = Deno.env.get('AI_TRANSLATION_STRATEGY') ?? 'ai';
const translationStrategy = !Deno.env.get('GEMINI_API_KEY') && translationStrategyRaw === 'ai' ? 'none' : translationStrategyRaw;

export async function maybeTranslateNutritionResponse(
  base: GeminiNutritionResponse,
  targetLocale: Locale,
): Promise<GeminiNutritionResponse | null> {
  if (targetLocale === DEFAULT_LOCALE) {
    return cloneResponse(base);
  }

  if (translationStrategy === 'copy') {
    return cloneResponse(base);
  }

  if (translationStrategy === 'none') {
    return null;
  }

  const { translated, errored } = await translateWithGemini(base, targetLocale);
  if (errored) {
    console.warn('Failed to translate nutrition response', errored);
  }
  return translated;
}

async function translateWithGemini(
  base: GeminiNutritionResponse,
  targetLocale: Locale,
): Promise<{ translated: GeminiNutritionResponse | null; errored: Error | null }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return { translated: null, errored: null };
  }

  const prompt = buildTranslationPrompt(base, targetLocale);
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  url.searchParams.set('key', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), translationTimeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 32,
          topP: 0.8,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { translated: cloneResponse(base), errored: new Error(`Gemini translation failed: ${response.status} ${text}`) };
    }

    const data = (await response.json()) as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof raw !== 'string') {
      return { translated: cloneResponse(base), errored: new Error('Gemini translation returned no text') };
    }

    const parsed: TranslationResult = TranslationResultSchema.parse(JSON.parse(raw));

    const translated = cloneResponse(base);
    translated.dish = parsed.dish;
    translated.items = (translated.items ?? []).map((item, index) => {
      const override = parsed.items.find((entry) => entry.index === index);
      return override ? { ...item, name: override.name } : { ...item };
    });
    if (parsed.warnings?.length) {
      translated.warnings = [...(translated.warnings ?? []), ...parsed.warnings];
    }
    translated.meta = {
      ...(translated.meta ?? {}),
      translation: {
        locale: parsed.locale,
        sourceLocale: DEFAULT_LOCALE,
      },
    };

    return { translated, errored: null };
  } finally {
    clearTimeout(timer);
  }
}

function buildTranslationPrompt(base: GeminiNutritionResponse, targetLocale: Locale) {
  const summary = {
    dish: base.dish,
    items: (base.items ?? []).map((item, index) => ({ index, name: item.name })),
    warnings: base.warnings ?? [],
  };

  return `You are a professional translator. Translate the "dish" label and each item "name" into the locale ${targetLocale}. Preserve nutrition values and ordering using the provided index. Return ONLY JSON matching this TypeScript type and nothing else:
{
  "locale": string,
  "dish": string,
  "items": Array<{ "index": number, "name": string }>,
  "warnings"?: string[]
}
Use natural wording for ${targetLocale}. Base JSON: ${JSON.stringify(summary)}`;
}

export function cloneResponse(payload: GeminiNutritionResponse): GeminiNutritionResponse {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}
