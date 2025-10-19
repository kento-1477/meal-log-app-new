import { Prisma } from '@prisma/client';
import {
  FavoriteMealCreateRequestSchema,
  FavoriteMealDraftSchema,
  FavoriteMealItemInputSchema,
  FavoriteMealSchema,
  FavoriteMealUpdateRequestSchema,
  type FavoriteMeal,
  type FavoriteMealDraft,
  type FavoriteMealItemInput,
  type GeminiNutritionResponse,
} from '@meal-log/shared';
import { prisma } from '../db/prisma.js';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_LOCALE, resolveMealLogLocalization } from '../utils/locale.js';
import type { MealLogAiRaw, LocalizationResolution, Locale } from '@meal-log/shared';

const DEFAULT_NOTES = null;

export function buildFavoriteDraftFromAnalysis(
  response: GeminiNutritionResponse,
  options: { sourceMealLogId?: string | null; notes?: string | null } = {},
): FavoriteMealDraft {
  const items = response.items.map<FavoriteMealItemInput>((item, index) => ({
    name: item.name,
    grams: item.grams,
    calories: null,
    protein_g: item.protein_g ?? null,
    fat_g: item.fat_g ?? null,
    carbs_g: item.carbs_g ?? null,
    order_index: index,
  }));

  return {
    name: response.dish ?? 'お気に入り',
    notes: options.notes ?? DEFAULT_NOTES,
    totals: response.totals,
    items,
    source_log_id: options.sourceMealLogId ?? null,
  } satisfies FavoriteMealDraft;
}

export async function listFavoriteMeals(userId: number): Promise<FavoriteMeal[]> {
  const records = await prisma.favoriteMeal.findMany({
    where: { userId },
    include: { items: { orderBy: { orderIndex: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return records.map(mapFavoriteMeal);
}

export async function getFavoriteMeal(userId: number, favoriteId: number): Promise<FavoriteMeal> {
  const record = await prisma.favoriteMeal.findFirst({
    where: { id: favoriteId, userId },
    include: { items: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!record) {
    throw notFoundError();
  }
  return mapFavoriteMeal(record);
}

export async function createFavoriteMeal(userId: number, payload: unknown): Promise<FavoriteMeal> {
  const parsed = FavoriteMealCreateRequestSchema.parse(payload);
  const normalized = normalizeDraft(parsed);

  const created = await prisma.favoriteMeal.create({
    data: {
      userId,
      sourceMealLogId: normalized.source_log_id,
      name: normalized.name,
      notes: normalized.notes ?? null,
      calories: normalized.totals.kcal,
      proteinG: normalized.totals.protein_g,
      fatG: normalized.totals.fat_g,
      carbsG: normalized.totals.carbs_g,
      items: {
        create: normalized.items.map((item, idx) => ({
          name: item.name,
          grams: item.grams,
          calories: item.calories ?? null,
          proteinG: item.protein_g ?? null,
          fatG: item.fat_g ?? null,
          carbsG: item.carbs_g ?? null,
          orderIndex: item.order_index ?? idx,
        })),
      },
    },
    include: { items: { orderBy: { orderIndex: 'asc' } } },
  });

  return mapFavoriteMeal(created);
}

export async function updateFavoriteMeal(userId: number, favoriteId: number, payload: unknown): Promise<FavoriteMeal> {
  const parsed = FavoriteMealUpdateRequestSchema.parse(payload);

  const existing = await prisma.favoriteMeal.findFirst({
    where: { id: favoriteId, userId },
    include: { items: true },
  });
  if (!existing) {
    throw notFoundError();
  }

  const normalizedTotals = resolveTotals(parsed, existing);

  const updateData: Prisma.FavoriteMealUpdateInput = {
    name: parsed.name ?? existing.name,
    notes: parsed.notes ?? existing.notes,
    sourceMealLogId: parsed.source_log_id ?? existing.sourceMealLogId,
    calories: normalizedTotals.kcal,
    proteinG: normalizedTotals.protein_g,
    fatG: normalizedTotals.fat_g,
    carbsG: normalizedTotals.carbs_g,
  };

  const shouldReplaceItems = Array.isArray(parsed.items);

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldReplaceItems) {
      await tx.favoriteMealItem.deleteMany({ where: { favoriteMealId: favoriteId } });
      const items = parsed.items ?? [];
      if (items.length > 0) {
        await tx.favoriteMealItem.createMany({
          data: items.map((item, idx) => ({
            favoriteMealId: favoriteId,
            name: item.name,
            grams: item.grams,
            calories: item.calories ?? null,
            proteinG: item.protein_g ?? null,
            fatG: item.fat_g ?? null,
            carbsG: item.carbs_g ?? null,
            orderIndex: item.order_index ?? idx,
          })),
        });
      }
    }

    return tx.favoriteMeal.update({
      where: { id: favoriteId },
      data: updateData,
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });
  });

  return mapFavoriteMeal(updated);
}

export async function deleteFavoriteMeal(userId: number, favoriteId: number): Promise<void> {
  const deleted = await prisma.favoriteMeal.deleteMany({
    where: { id: favoriteId, userId },
  });
  if (deleted === 0) {
    throw notFoundError();
  }
}

export async function logFavoriteMeal(userId: number, favoriteId: number) {
  const favorite = await prisma.favoriteMeal.findFirst({
    where: { id: favoriteId, userId },
    include: {
      items: { orderBy: { orderIndex: 'asc' } },
    },
  });

  if (!favorite) {
    throw notFoundError();
  }

  const baseResponse = favoriteToGeminiResponse(favorite);

  const aiPayload: MealLogAiRaw = {
    ...baseResponse,
    locale: DEFAULT_LOCALE,
    translations: { [DEFAULT_LOCALE]: cloneTranslation(baseResponse) },
  };

  const log = await prisma.mealLog.create({
    data: {
      userId,
      foodItem: baseResponse.dish,
      calories: baseResponse.totals.kcal,
      proteinG: baseResponse.totals.protein_g,
      fatG: baseResponse.totals.fat_g,
      carbsG: baseResponse.totals.carbs_g,
      aiRaw: aiPayload,
      zeroFloored: false,
      guardrailNotes: null,
      landingType: baseResponse.landing_type,
    },
  });

  const localization = resolveMealLogLocalization(aiPayload, DEFAULT_LOCALE);
  const translations = cloneTranslationsMap(localization.translations);
  const translation = localization.translation ?? baseResponse;

  const favoriteDraft = buildFavoriteDraftFromAnalysis(translation, {
    sourceMealLogId: log.id,
  });

  return {
    ok: true,
    success: true,
    idempotent: false,
    idempotency_key: `favorite-${favoriteId}-${Date.now()}`,
    logId: log.id,
    requestLocale: localization.requestedLocale,
    locale: localization.resolvedLocale,
    translations,
    fallbackApplied: localization.fallbackApplied,
    dish: translation.dish,
    confidence: translation.confidence,
    totals: translation.totals,
    items: translation.items,
    breakdown: {
      items: translation.items,
      warnings: translation.warnings ?? [],
    },
    meta: {
      favoriteId,
      localization: buildLocalizationMeta(localization),
      created_from_favorite: true,
    } satisfies Record<string, unknown>,
    usage: undefined,
    favoriteCandidate: favoriteDraft,
  } satisfies FavoriteMealLogResult;
}

interface FavoriteMealLogResult {
  ok: true;
  success: true;
  idempotent: false;
  idempotency_key: string;
  logId: string;
  requestLocale: Locale;
  locale: Locale;
  translations: Record<Locale, GeminiNutritionResponse>;
  fallbackApplied: boolean;
  dish: string;
  confidence: number;
  totals: GeminiNutritionResponse['totals'];
  items: GeminiNutritionResponse['items'];
  breakdown: { items: GeminiNutritionResponse['items']; warnings: string[] };
  meta: Record<string, unknown>;
  usage: undefined;
  favoriteCandidate: FavoriteMealDraft;
}

function normalizeDraft(draft: FavoriteMealDraft): FavoriteMealDraft {
  FavoriteMealDraftSchema.parse(draft);
  const items = draft.items.map((item, idx) => (
    FavoriteMealItemInputSchema.parse({ ...item, order_index: item.order_index ?? idx })
  ));

  return {
    ...draft,
    items,
    totals: draft.totals,
    source_log_id: draft.source_log_id ?? null,
    notes: draft.notes ?? null,
  } satisfies FavoriteMealDraft;
}

function resolveTotals(
  payload: Partial<FavoriteMealDraft>,
  existing: { calories: number; proteinG: number; fatG: number; carbsG: number },
) {
  if (payload.totals) {
    return payload.totals;
  }

  if (payload.items) {
    const computed = computeTotalsFromItems(payload.items);
    if (computed) {
      return computed;
    }
  }

  return {
    kcal: existing.calories,
    protein_g: existing.proteinG,
    fat_g: existing.fatG,
    carbs_g: existing.carbsG,
  };
}

function computeTotalsFromItems(items: FavoriteMealItemInput[]) {
  if (!items.length) {
    return null;
  }
  let calories = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;

  for (const item of items) {
    if (
      typeof item.calories !== 'number' ||
      typeof item.protein_g !== 'number' ||
      typeof item.fat_g !== 'number' ||
      typeof item.carbs_g !== 'number'
    ) {
      return null;
    }
    calories += item.calories;
    protein += item.protein_g;
    fat += item.fat_g;
    carbs += item.carbs_g;
  }

  return {
    kcal: calories,
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
  };
}

function mapFavoriteMeal(record: Prisma.FavoriteMealGetPayload<{ include: { items: true } }>): FavoriteMeal {
  const favorite = {
    id: record.id,
    name: record.name,
    notes: record.notes ?? null,
    totals: {
      kcal: record.calories,
      protein_g: record.proteinG,
      fat_g: record.fatG,
      carbs_g: record.carbsG,
    },
    source_log_id: record.sourceMealLogId ?? null,
    items: record.items
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        id: item.id,
        name: item.name,
        grams: item.grams,
        calories: item.calories ?? null,
        protein_g: item.proteinG ?? null,
        fat_g: item.fatG ?? null,
        carbs_g: item.carbsG ?? null,
        order_index: item.orderIndex,
      })),
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  } satisfies FavoriteMeal;

  FavoriteMealSchema.parse(favorite);
  return favorite;
}

function notFoundError() {
  const error = new Error('お気に入りが見つかりませんでした');
  Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
  return error;
}

function favoriteToGeminiResponse(
  favorite: Prisma.FavoriteMealGetPayload<{ include: { items: true } }>,
): GeminiNutritionResponse {
  return {
    dish: favorite.name,
    confidence: 0.95,
    totals: {
      kcal: favorite.calories,
      protein_g: favorite.proteinG,
      fat_g: favorite.fatG,
      carbs_g: favorite.carbsG,
    },
    items: favorite.items
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        name: item.name,
        grams: item.grams,
        protein_g: item.proteinG ?? undefined,
        fat_g: item.fatG ?? undefined,
        carbs_g: item.carbsG ?? undefined,
      })),
    warnings: [],
    landing_type: null,
    meta: { favoriteId: favorite.id },
  } satisfies GeminiNutritionResponse;
}

function cloneTranslationsMap(translations: Record<Locale, GeminiNutritionResponse>) {
  const entries = Object.entries(translations).map(([locale, value]) => [locale, cloneTranslation(value)] as const);
  return Object.fromEntries(entries) as Record<Locale, GeminiNutritionResponse>;
}

function cloneTranslation(payload: GeminiNutritionResponse): GeminiNutritionResponse {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}

function buildLocalizationMeta(localization: LocalizationResolution) {
  return {
    requested: localization.requestedLocale,
    resolved: localization.resolvedLocale,
    fallbackApplied: localization.fallbackApplied,
    available: Object.keys(localization.translations),
  } satisfies Record<string, unknown>;
}
