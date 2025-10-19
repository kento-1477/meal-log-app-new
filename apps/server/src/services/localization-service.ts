import { z } from 'zod';
import type { GeminiNutritionResponse, Locale } from '@meal-log/shared';
import { LocaleSchema } from '@meal-log/shared';
import { env, timeoutConfig } from '../env.js';
import { DEFAULT_LOCALE } from '../utils/locale.js';

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

export async function maybeTranslateNutritionResponse(
  base: GeminiNutritionResponse,
  targetLocale: Locale,
): Promise<GeminiNutritionResponse | null> {
  if (targetLocale === DEFAULT_LOCALE) {
    return cloneResponse(base);
  }

  const rawStrategy = env.AI_TRANSLATION_STRATEGY ?? 'ai';
  const strategy = !env.GEMINI_API_KEY && rawStrategy === 'ai' ? 'none' : rawStrategy;

  if (strategy === 'copy') {
    return cloneResponse(base);
  }

  if (strategy === 'none') {
    return null;
  }

  try {
    const translated = await translateWithGemini(base, targetLocale);
    return translated;
  } catch (error) {
    console.warn('Failed to translate nutrition response', error);
    return null;
  }
}

async function translateWithGemini(base: GeminiNutritionResponse, targetLocale: Locale) {
  if (!env.GEMINI_API_KEY) {
    return null;
  }

  const prompt = buildTranslationPrompt(base, targetLocale);
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  url.searchParams.set('key', env.GEMINI_API_KEY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutConfig.AI_ATTEMPT_TIMEOUT_MS ?? 25000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
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
      throw new Error(`Gemini translation failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof raw !== 'string') {
      throw new Error('Gemini translation returned no text');
    }

    const parsed = TranslationResultSchema.parse(JSON.parse(raw)) as TranslationResult;

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

    return translated;
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

function cloneResponse(payload: GeminiNutritionResponse): GeminiNutritionResponse {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}
