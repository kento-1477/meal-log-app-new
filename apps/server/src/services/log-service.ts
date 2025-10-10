import type { Express } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { GeminiNutritionResponse } from '@meal-log/shared';
import { prisma } from '../db/prisma.js';
import { analyzeMealWithGemini } from './gemini-service.js';
import type { SlotSelectionRequest } from '@meal-log/shared';

interface ProcessMealLogParams {
  userId: number;
  message: string;
  file?: Express.Multer.File;
  idempotencyKey?: string;
}

interface ProcessMealLogResult {
  ok: boolean;
  success: boolean;
  idempotent: boolean;
  idempotency_key: string;
  logId: string;
  dish: string;
  confidence: number;
  totals: GeminiNutritionResponse['totals'];
  items: GeminiNutritionResponse['items'];
  breakdown: {
    items: GeminiNutritionResponse['items'];
    warnings: string[];
  };
  meta: Record<string, unknown>;
}

export async function processMealLog(params: ProcessMealLogParams): Promise<ProcessMealLogResult> {
  const requestKey = params.idempotencyKey ?? buildRequestKey(params);

  const existing = await prisma.ingestRequest.findUnique({
    where: { userId_requestKey: { userId: params.userId, requestKey } },
    include: { log: true },
  });

  if (existing?.log && !existing.log.zeroFloored) {
    const log = existing.log;
    const aiRaw = log.aiRaw as GeminiNutritionResponse | null;
    const totals = aiRaw?.totals ?? {
      kcal: log.calories,
      protein_g: log.proteinG,
      fat_g: log.fatG,
      carbs_g: log.carbsG,
    };

    return {
      ok: true,
      success: true,
      idempotent: true,
      idempotency_key: requestKey,
      logId: log.id,
      dish: aiRaw?.dish ?? log.foodItem,
      confidence: aiRaw?.confidence ?? 0.5,
      totals,
      items: aiRaw?.items ?? [],
      breakdown: {
        items: aiRaw?.items ?? [],
        warnings: Array.isArray(aiRaw?.warnings) ? aiRaw.warnings : [],
      },
      meta: {
        ...(aiRaw?.meta ?? {}),
        reused: true,
      },
    };
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

  const imageBase64 = params.file ? params.file.buffer.toString('base64') : undefined;
  const imageMimeType = params.file?.mimetype;

  let analysis;
  try {
    analysis = await analyzeMealWithGemini({
      message: params.message,
      imageBase64,
      imageMimeType,
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
  const warnings = [...(enrichedResponse.warnings ?? [])];
  if (zeroFloored) {
    warnings.push('zeroFloored: AI returned one or more zero totals');
  }

  const log = await prisma.mealLog.create({
    data: {
      userId: params.userId,
      foodItem: enrichedResponse.dish ?? params.message,
      calories: enrichedResponse.totals.kcal,
      proteinG: enrichedResponse.totals.protein_g,
      fatG: enrichedResponse.totals.fat_g,
      carbsG: enrichedResponse.totals.carbs_g,
      aiRaw: enrichedResponse,
      zeroFloored,
      guardrailNotes: zeroFloored ? 'zeroFloored' : null,
      landingType: enrichedResponse.landing_type ?? null,
    },
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

  const meta = {
    ...(enrichedResponse.meta ?? {}),
    imageUrl,
    fallback_model_used: analysis.meta.model === 'models/gemini-2.5-pro',
  } satisfies Record<string, unknown>;

  return {
    ok: true,
    success: true,
    idempotent: false,
    idempotency_key: requestKey,
    logId: log.id,
    dish: enrichedResponse.dish,
    confidence: enrichedResponse.confidence,
    totals: enrichedResponse.totals,
    items: enrichedResponse.items,
    breakdown: {
      items: enrichedResponse.items,
      warnings,
    },
    meta,
  };
}

export async function chooseSlot(request: SlotSelectionRequest, userId: number) {
  const log = await prisma.mealLog.findFirst({
    where: { id: request.logId, userId },
  });

  if (!log) {
    const error = new Error('Log not found');
    Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
    throw error;
  }

  if (log.version !== request.prevVersion) {
    const error = new Error('Conflict: stale version');
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
