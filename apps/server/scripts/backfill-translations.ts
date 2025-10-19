import { PrismaClient } from '@prisma/client';
import {
  MealLogAiRawSchema,
  LocaleSchema,
  type GeminiNutritionResponse,
  type Locale,
  type MealLogAiRaw,
} from '@meal-log/shared';
import { maybeTranslateNutritionResponse } from '../src/services/localization-service.js';
import { normalizeLocale, DEFAULT_LOCALE } from '../src/utils/locale.js';
import { env } from '../src/env.js';

const MAX_TRANSLATION_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

interface CliOptions {
  targetLocale: Locale;
  batchSize: number;
}

function parseCliArgs(): CliOptions {
  const [, , ...args] = process.argv;
  let target = 'ja-JP';
  let batchSize = 50;

  for (const arg of args) {
    if (arg.startsWith('--locale=')) {
      target = arg.replace('--locale=', '').trim();
    }
    if (arg.startsWith('--batch=')) {
      const value = Number(arg.replace('--batch=', '').trim());
      if (Number.isFinite(value) && value > 0) {
        batchSize = value;
      }
    }
  }

  const parsedLocale = LocaleSchema.safeParse(target);
  if (!parsedLocale.success) {
    throw new Error(`Invalid locale provided: ${target}`);
  }

  return { targetLocale: parsedLocale.data, batchSize };
}

const prisma = new PrismaClient();
const STRATEGY = env.AI_TRANSLATION_STRATEGY ?? 'ai';

function cloneTranslation(payload: GeminiNutritionResponse): GeminiNutritionResponse {
  return {
    ...payload,
    totals: { ...payload.totals },
    items: (payload.items ?? []).map((item) => ({ ...item })),
    warnings: [...(payload.warnings ?? [])],
    meta: payload.meta ? { ...payload.meta } : undefined,
  };
}

function extractBaseTranslation(payload: MealLogAiRaw): GeminiNutritionResponse {
  return cloneTranslation({
    dish: payload.dish,
    confidence: payload.confidence,
    totals: payload.totals,
    items: payload.items ?? [],
    warnings: payload.warnings ?? [],
    landing_type: payload.landing_type ?? null,
    meta: payload.meta,
  });
}

async function main() {
  const options = parseCliArgs();
  const targetLocale = options.targetLocale;
  const batchSize = options.batchSize;

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let cursor: string | undefined;

  console.info(`[backfill] Starting translation backfill to ${targetLocale} (batch ${batchSize})`);

  while (true) {
    const logs = await prisma.mealLog.findMany({
      where: { aiRaw: { not: null } },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (!logs.length) {
      break;
    }

    for (const log of logs) {
      processed += 1;
      cursor = log.id;

      const parsed = MealLogAiRawSchema.safeParse(log.aiRaw);
      if (!parsed.success) {
        skipped += 1;
        continue;
      }

      const payload = parsed.data;
      if (payload.translations?.[targetLocale]) {
        continue;
      }

      const baseLocale = payload.locale ? normalizeLocale(payload.locale) : DEFAULT_LOCALE;
      const baseTranslation = payload.translations?.[baseLocale] ?? extractBaseTranslation(payload);

      let translated: GeminiNutritionResponse | null = null;
      for (let attempt = 0; attempt <= MAX_TRANSLATION_RETRIES; attempt += 1) {
        translated = await maybeTranslateNutritionResponse(baseTranslation, targetLocale);
        if (translated || STRATEGY === 'copy' || STRATEGY === 'none') {
          break;
        }
        if (attempt < MAX_TRANSLATION_RETRIES) {
          console.warn(
            `[backfill] translation failed for ${log.id} (attempt ${attempt + 1}). Retrying...`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }

      if (!translated) {
        console.warn(`[backfill] translation unavailable for ${log.id}, skipping.`);
        skipped += 1;
        continue;
      }

      const nextTranslations = { ...(payload.translations ?? {}) };
      nextTranslations[targetLocale] = translated;

      await prisma.mealLog.update({
        where: { id: log.id },
        data: {
          aiRaw: {
            ...payload,
            translations: nextTranslations,
          },
        },
      });

      updated += 1;
      console.info(`[backfill] translated ${log.id} -> ${targetLocale}`);
    }
  }

  console.info(`[backfill] Completed. processed=${processed} updated=${updated} skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error('[backfill] Failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
