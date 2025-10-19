import type { Express } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  AiUsageSummary,
  FavoriteMealDraft,
  GeminiNutritionResponse,
  SlotSelectionRequest,
  Locale,
  MealLogAiRaw,
} from '@meal-log/shared';
import { MealPeriod, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { analyzeMealWithGemini } from './gemini-service.js';
import { invalidateDashboardCacheForUser } from './dashboard-service.js';
import {
  evaluateAiUsage,
  recordAiUsage,
  buildUsageLimitError,
  summarizeUsageStatus,
} from './ai-usage-service.js';
import { DEFAULT_LOCALE, resolveMealLogLocalization, normalizeLocale, parseMealLogAiRaw } from '../utils/locale.js';
import type { LocalizationResolution } from '../utils/locale.js';
import { maybeTranslateNutritionResponse } from './localization-service.js';
import { buildFavoriteDraftFromAnalysis } from './favorite-service.js';

interface ProcessMealLogParams {
  userId: number;
  message: string;
  file?: Express.Multer.File;
  idempotencyKey?: string;
  locale?: Locale;
}

interface ProcessMealLogResult {
  ok: boolean;
  success: boolean;
  idempotent: boolean;
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
  breakdown: {
    items: GeminiNutritionResponse['items'];
    warnings: string[];
  };
  meta: Record<string, unknown>;
  usage?: AiUsageSummary;
  favoriteCandidate: FavoriteMealDraft;
}

const inferMealPeriod = (date: Date): MealPeriod => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10) {
    return MealPeriod.BREAKFAST;
  }
  if (hour >= 10 && hour < 15) {
    return MealPeriod.LUNCH;
  }
  if (hour >= 15 && hour < 21) {
    return MealPeriod.DINNER;
  }
  return MealPeriod.SNACK;
};

export async function processMealLog(params: ProcessMealLogParams): Promise<ProcessMealLogResult> {
  const requestKey = params.idempotencyKey ?? buildRequestKey(params);
  const requestedLocale = normalizeLocale(params.locale);

  const existing = await prisma.ingestRequest.findUnique({
    where: { userId_requestKey: { userId: params.userId, requestKey } },
    include: { log: true },
  });

  if (existing?.log && !existing.log.zeroFloored) {
    const usageStatus = await evaluateAiUsage(params.userId);
    const usageSummary = summarizeUsageStatus(usageStatus);

    const logRecord = existing.log;
    const localization = resolveMealLogLocalization(logRecord.aiRaw, requestedLocale);
    const translation = localization.translation;

    const totals = translation?.totals ?? {
      kcal: logRecord.calories,
      protein_g: logRecord.proteinG,
      fat_g: logRecord.fatG,
      carbs_g: logRecord.carbsG,
    };

    const items = translation?.items ?? [];
    const warnings = [...(translation?.warnings ?? [])];
    if (localization.fallbackApplied) {
      warnings.push(`translation_fallback:${localization.resolvedLocale}`);
    }

    const translations = cloneTranslationsMap(localization.translations);
    const favoriteCandidate = buildFavoriteDraftPayload({
      translation,
      totals,
      items,
      fallbackDish: logRecord.foodItem,
      sourceMealLogId: logRecord.id,
    });

    const meta: Record<string, unknown> = {
      ...(translation?.meta ?? {}),
      reused: true,
      mealPeriod: logRecord.mealPeriod,
      localization: buildLocalizationMeta({ ...localization, translations }),
    };
    if (logRecord.imageUrl) {
      meta.imageUrl = logRecord.imageUrl;
    }

    return {
      ok: true,
      success: true,
      idempotent: true,
      idempotency_key: requestKey,
      logId: logRecord.id,
      requestLocale: localization.requestedLocale,
      locale: localization.resolvedLocale,
      translations,
      fallbackApplied: localization.fallbackApplied,
      dish: translation?.dish ?? logRecord.foodItem,
      confidence: translation?.confidence ?? 0.5,
      totals,
      items,
      breakdown: {
        items,
        warnings,
      },
      meta,
      usage: usageSummary,
      favoriteCandidate,
    };
  }

  const imageBase64 = params.file ? params.file.buffer.toString('base64') : undefined;
  const imageMimeType = params.file?.mimetype;

  const usageStatus = await evaluateAiUsage(params.userId);
  if (!usageStatus.allowed) {
    throw buildUsageLimitError(usageStatus);
  }

  let ingest = existing;
  if (!ingest) {
    ingest = await prisma.ingestRequest.create({
      data: {
        userId: params.userId,
        requestKey,
      },
    });
  }

  let analysis;
  try {
    analysis = await analyzeMealWithGemini({
      message: params.message,
      imageBase64,
      imageMimeType,
      locale: requestedLocale,
    });
  } catch (error) {
    await prisma.ingestRequest.update({
      where: { id: ingest.id },
      data: { logId: null },
    });
    throw error;
  }

  const enrichedResponse: GeminiNutritionResponse = {
    ...analysis.response,
    meta: {
      ...(analysis.response.meta ?? {}),
      model: analysis.meta.model,
      attempt: analysis.meta.attempt,
      latencyMs: analysis.meta.latencyMs,
      attemptReports: analysis.attemptReports,
    },
  };

  const zeroFloored = Object.values(enrichedResponse.totals).some((value) => value === 0);
  const mealPeriod = inferMealPeriod(new Date());

  const seededTranslations: Record<Locale, GeminiNutritionResponse> = {
    [DEFAULT_LOCALE]: cloneNutritionResponse(enrichedResponse),
  };
  if (requestedLocale !== DEFAULT_LOCALE) {
    const localized = await maybeTranslateNutritionResponse(enrichedResponse, requestedLocale);
    if (localized) {
      seededTranslations[requestedLocale] = cloneNutritionResponse(localized);
    }
  }

  const aiPayload: MealLogAiRaw = {
    ...cloneNutritionResponse(enrichedResponse),
    locale: DEFAULT_LOCALE,
    translations: seededTranslations,
  };

  const localization = resolveMealLogLocalization(aiPayload, requestedLocale);
  const translation = localization.translation ?? cloneNutritionResponse(enrichedResponse);
    const responseItems = translation.items ?? [];
    const warnings = [...(translation.warnings ?? [])];
    if (zeroFloored) {
      warnings.push('zeroFloored: AI が推定した栄養素の一部が 0 として返されました');
    }
    if (localization.fallbackApplied) {
      warnings.push(`translation_fallback:${localization.resolvedLocale}`);
    }
  
    const log = await prisma.mealLog.create({
      data: {
        userId: params.userId,
        foodItem: translation.dish ?? params.message,
        calories: enrichedResponse.totals.kcal,
        proteinG: enrichedResponse.totals.protein_g,
        fatG: enrichedResponse.totals.fat_g,
        carbsG: enrichedResponse.totals.carbs_g,
        aiRaw: aiPayload,
        zeroFloored,
        guardrailNotes: zeroFloored ? 'zeroFloored' : null,
        landingType: enrichedResponse.landing_type ?? null,
        mealPeriod,
      },
    });
  
    const favoriteCandidate = buildFavoriteDraftPayload({
      translation,
      totals: translation.totals,
      items: responseItems,
      fallbackDish: translation.dish,
      sourceMealLogId: log.id,
    });

  let imageUrl: string | null = null;
  if (params.file && imageBase64) {
    imageUrl = `data:${params.file.mimetype};base64,${imageBase64}`;
    await prisma.mediaAsset.create({
      data: {
        mealLogId: log.id,
        mimeType: params.file.mimetype,
        url: imageUrl,
        sizeBytes: params.file.size,
      },
    });
    await prisma.mealLog.update({
      where: { id: log.id },
      data: { imageUrl },
    });
  }

  await prisma.ingestRequest.update({
    where: { id: ingest.id },
    data: { logId: zeroFloored ? null : log.id },
  });

  invalidateDashboardCacheForUser(params.userId);

  const usageSummary = await recordAiUsage({
    userId: params.userId,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });

  const meta: Record<string, unknown> = {
    ...(enrichedResponse.meta ?? {}),
    imageUrl,
    fallback_model_used: analysis.meta.model === 'models/gemini-2.5-pro',
    mealPeriod,
    localization: buildLocalizationMeta({ ...localization, translations: responseTranslations }),
  };

  return {
    ok: true,
    success: true,
    idempotent: false,
    idempotency_key: requestKey,
    logId: log.id,
    requestLocale: localization.requestedLocale,
    locale: localization.resolvedLocale,
    translations: responseTranslations,
    fallbackApplied: localization.fallbackApplied,
    dish: translation.dish,
    confidence: translation.confidence,
    totals: translation.totals,
    items: responseItems,
    breakdown: {
      items: responseItems,
      warnings,
    },
    meta,
    usage: usageSummary,
    favoriteCandidate,
  };
}

interface UpdateMealLogParams {
  logId: string;
  userId: number;
  updates: {
    foodItem?: string;
    calories?: number;
    proteinG?: number;
    fatG?: number;
    carbsG?: number;
    mealPeriod?: MealPeriod;
  };
}

export async function updateMealLog({ logId, userId, updates }: UpdateMealLogParams) {
  const log = await prisma.mealLog.findFirst({
    where: { id: logId, userId },
  });

  if (!log) {
    const error = new Error('食事記録が見つかりませんでした');
    Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
    throw error;
  }

  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const updateData: Prisma.MealLogUpdateInput = {
    version: { increment: 1 },
  };

  if (typeof updates.foodItem === 'string' && updates.foodItem !== log.foodItem) {
    changes.foodItem = { before: log.foodItem, after: updates.foodItem };
    updateData.foodItem = updates.foodItem;
  }
  if (typeof updates.calories === 'number' && updates.calories !== log.calories) {
    changes.calories = { before: log.calories, after: updates.calories };
    updateData.calories = updates.calories;
  }
  if (typeof updates.proteinG === 'number' && updates.proteinG !== log.proteinG) {
    changes.proteinG = { before: log.proteinG, after: updates.proteinG };
    updateData.proteinG = updates.proteinG;
  }
  if (typeof updates.fatG === 'number' && updates.fatG !== log.fatG) {
    changes.fatG = { before: log.fatG, after: updates.fatG };
    updateData.fatG = updates.fatG;
  }
  if (typeof updates.carbsG === 'number' && updates.carbsG !== log.carbsG) {
    changes.carbsG = { before: log.carbsG, after: updates.carbsG };
    updateData.carbsG = updates.carbsG;
  }
  if (typeof updates.mealPeriod !== 'undefined' && updates.mealPeriod !== log.mealPeriod) {
    changes.mealPeriod = { before: log.mealPeriod, after: updates.mealPeriod };
    updateData.mealPeriod = updates.mealPeriod;
  }

  if (Object.keys(changes).length === 0) {
    return log;
  }

  const parsedAiRaw = parseMealLogAiRaw(log.aiRaw);
  let updatedAiRaw: MealLogAiRaw | null = parsedAiRaw;

  if (parsedAiRaw) {
    const baseLocale = parsedAiRaw.locale ? normalizeLocale(parsedAiRaw.locale) : DEFAULT_LOCALE;
    const baseSource =
      parsedAiRaw.translations?.[baseLocale] ??
      parsedAiRaw.translations?.[DEFAULT_LOCALE] ??
      cloneNutritionResponse(parsedAiRaw);

    const updatedBase = cloneNutritionResponse(baseSource);
    if (typeof updates.foodItem === 'string') {
      updatedBase.dish = updates.foodItem;
    }
    updatedBase.totals = {
      ...updatedBase.totals,
      ...(typeof updates.calories === 'number' ? { kcal: updates.calories } : {}),
      ...(typeof updates.proteinG === 'number' ? { protein_g: updates.proteinG } : {}),
      ...(typeof updates.fatG === 'number' ? { fat_g: updates.fatG } : {}),
      ...(typeof updates.carbsG === 'number' ? { carbs_g: updates.carbsG } : {}),
    };

    const updatedTranslations = { ...(parsedAiRaw.translations ?? {}) } as Record<Locale, GeminiNutritionResponse>;
    updatedTranslations[baseLocale] = updatedBase;

    updatedAiRaw = {
      ...parsedAiRaw,
      dish: updatedBase.dish,
      totals: updatedBase.totals,
      items: updatedBase.items,
      warnings: updatedBase.warnings,
      translations: updatedTranslations,
    };
  } else if (log.aiRaw) {
    const legacy = log.aiRaw as GeminiNutritionResponse;
    const updatedLegacy = {
      ...legacy,
      dish: typeof updates.foodItem === 'string' ? updates.foodItem : legacy.dish,
      totals: {
        ...legacy.totals,
        ...(typeof updates.calories === 'number' ? { kcal: updates.calories } : {}),
        ...(typeof updates.proteinG === 'number' ? { protein_g: updates.proteinG } : {}),
        ...(typeof updates.fatG === 'number' ? { fat_g: updates.fatG } : {}),
        ...(typeof updates.carbsG === 'number' ? { carbs_g: updates.carbsG } : {}),
      },
    } satisfies GeminiNutritionResponse;

    updatedAiRaw = {
      ...cloneNutritionResponse(updatedLegacy),
      locale: DEFAULT_LOCALE,
      translations: {
        [DEFAULT_LOCALE]: cloneNutritionResponse(updatedLegacy),
      },
    };
  }

  const updatedLog = await prisma.$transaction(async (tx) => {
    const saved = await tx.mealLog.update({
      where: { id: log.id },
      data: {
        ...updateData,
        aiRaw: updatedAiRaw ?? log.aiRaw,
      },
    });

    await tx.mealLogEdit.create({
      data: {
        mealLogId: log.id,
        userId,
        changes,
      },
    });

    return saved;
  });

  invalidateDashboardCacheForUser(userId);

  return updatedLog;
}

export async function chooseSlot(request: SlotSelectionRequest, userId: number) {
  const log = await prisma.mealLog.findFirst({
    where: { id: request.logId, userId },
  });

  if (!log) {
    const error = new Error('食事記録が見つかりませんでした');
    Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
    throw error;
  }

  if (log.version !== request.prevVersion) {
    const error = new Error('編集競合が発生しました。最新の内容を確認してください');
    Object.assign(error, { statusCode: StatusCodes.CONFLICT, expose: true });
    throw error;
  }

  const aiRaw = (log.aiRaw ?? {}) as GeminiNutritionResponse & { slots?: Record<string, unknown> };
  const slots = { ...(aiRaw.slots ?? {}) };
  slots[request.key] = request.value;

  const updated = await prisma.mealLog.update({
    where: { id: log.id },
    data: {
      aiRaw: {
        ...aiRaw,
        slots,
      },
      version: { increment: 1 },
    },
  });

  return updated;
}

function buildLocalizationMeta(localization: LocalizationResolution) {
  return {
    requested: localization.requestedLocale,
    resolved: localization.resolvedLocale,
    fallbackApplied: localization.fallbackApplied,
    available: Object.keys(localization.translations),
  } satisfies Record<string, unknown>;
}

function cloneNutritionResponse(payload: GeminiNutritionResponse): GeminiNutritionResponse {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}

function cloneTranslationsMap(translations: Record<Locale, GeminiNutritionResponse>) {
  const entries = Object.entries(translations).map(([locale, value]) => [locale, cloneNutritionResponse(value)] as const);
  return Object.fromEntries(entries) as Record<Locale, GeminiNutritionResponse>;
}

function buildFavoriteDraftPayload(params: {
  translation: GeminiNutritionResponse | null;
  totals: GeminiNutritionResponse['totals'];
  items: GeminiNutritionResponse['items'];
  fallbackDish: string;
  sourceMealLogId?: string;
}): FavoriteMealDraft {
  const baseResponse: GeminiNutritionResponse = params.translation
    ? params.translation
    : {
        dish: params.fallbackDish,
        confidence: 0.6,
        totals: params.totals,
        items: params.items,
        warnings: [],
        landing_type: null,
        meta: undefined,
      };

  const draft = buildFavoriteDraftFromAnalysis(baseResponse, {
    sourceMealLogId: params.sourceMealLogId ?? null,
  });
  draft.totals = params.totals;
  if (!params.translation) {
    draft.items = params.items.map((item, index) => ({
      name: item.name,
      grams: item.grams,
      calories: null,
      protein_g: item.protein_g ?? null,
      fat_g: item.fat_g ?? null,
      carbs_g: item.carbs_g ?? null,
      order_index: index,
    }));
  }
  return draft;
}

function buildRequestKey(params: ProcessMealLogParams) {
  const hash = createHash('sha256');
  hash.update(String(params.userId));
  hash.update('|');
  hash.update(params.message);
  if (params.file) {
    hash.update('|');
    hash.update(params.file.buffer);
  }
  return `${Date.now()}-${uuidv4()}-${hash.digest('hex').slice(0, 12)}`;
}
