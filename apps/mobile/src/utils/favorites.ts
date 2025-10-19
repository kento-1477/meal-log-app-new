import type {
  FavoriteMealDraft,
  GeminiNutritionResponse,
  MealLogAiRaw,
  MealLogDetail,
  MealLogSummary,
  NutritionTotals,
} from '@meal-log/shared';

const DEFAULT_LOCALE_ORDER = ['ja-JP', 'en-US'];

export function buildFavoriteDraftFromSummary(log: MealLogSummary): FavoriteMealDraft {
  return buildDraft({
    id: log.id,
    dish: log.dish,
    aiRaw: log.ai_raw ?? null,
    totals: {
      kcal: log.calories,
      protein_g: log.protein_g,
      fat_g: log.fat_g,
      carbs_g: log.carbs_g,
    },
    preferredLocale: log.requested_locale ?? log.locale ?? null,
  });
}

export function buildFavoriteDraftFromDetail(log: MealLogDetail): FavoriteMealDraft {
  return buildDraft({
    id: log.id,
    dish: log.food_item,
    aiRaw: log.ai_raw ?? null,
    totals: {
      kcal: log.calories,
      protein_g: log.protein_g,
      fat_g: log.fat_g,
      carbs_g: log.carbs_g,
    },
    preferredLocale: log.requested_locale ?? log.locale ?? null,
  });
}

function buildDraft(params: {
  id: string;
  dish: string;
  aiRaw: MealLogAiRaw | null;
  totals: NutritionTotals;
  preferredLocale: string | null;
}): FavoriteMealDraft {
  const translation = chooseTranslation(params.aiRaw, params.preferredLocale);
  const items = translation?.items ?? params.aiRaw?.items ?? [];

  return {
    name: translation?.dish ?? params.dish,
    notes: null,
    totals: params.totals,
    items: items.map((item, index) => ({
      name: item.name,
      grams: item.grams,
      calories: null,
      protein_g: item.protein_g ?? null,
      fat_g: item.fat_g ?? null,
      carbs_g: item.carbs_g ?? null,
      order_index: index,
    })),
    source_log_id: params.id,
  } satisfies FavoriteMealDraft;
}

function chooseTranslation(aiRaw: MealLogAiRaw | null, preferredLocale: string | null): GeminiNutritionResponse | null {
  if (!aiRaw) {
    return null;
  }

  if (aiRaw.translations) {
    if (preferredLocale && aiRaw.translations[preferredLocale]) {
      return aiRaw.translations[preferredLocale] ?? null;
    }
    for (const locale of DEFAULT_LOCALE_ORDER) {
      if (aiRaw.translations[locale]) {
        return aiRaw.translations[locale] ?? null;
      }
    }
    const first = Object.values(aiRaw.translations)[0];
    if (first) {
      return first;
    }
  }

  return {
    dish: aiRaw.dish,
    confidence: aiRaw.confidence ?? 0.6,
    totals: aiRaw.totals,
    items: aiRaw.items ?? [],
    warnings: aiRaw.warnings ?? [],
    landing_type: aiRaw.landing_type ?? null,
    meta: aiRaw.meta,
  } satisfies GeminiNutritionResponse;
}
