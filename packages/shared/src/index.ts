import { z } from 'zod';

export const NutritionTotalsSchema = z.object({
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
});

export const NutritionItemSchema = z.object({
  name: z.string(),
  grams: z.number().nonnegative(),
  protein_g: z.number().nonnegative().optional(),
  fat_g: z.number().nonnegative().optional(),
  carbs_g: z.number().nonnegative().optional(),
});

export const HedgeAttemptReportSchema = z.object({
  model: z.string(),
  ok: z.boolean(),
  latencyMs: z.number(),
  textLen: z.number().optional(),
  attempt: z.number(),
  error: z.string().optional(),
});

export type HedgeAttemptReport = z.infer<typeof HedgeAttemptReportSchema>;

export const GeminiNutritionResponseSchema = z.object({
  dish: z.string(),
  confidence: z.number().min(0).max(1),
  totals: NutritionTotalsSchema,
  items: z.array(NutritionItemSchema).default([]),
  warnings: z.array(z.string()).default([]),
  landing_type: z.string().optional().nullable(),
  meta: z
    .object({
      model: z.string(),
      fallback_model_used: z.boolean().optional(),
      attempt: z.number().optional(),
      latencyMs: z.number().nonnegative().optional(),
      attemptReports: z.array(HedgeAttemptReportSchema).optional(),
    })
    .optional(),
});

export type GeminiNutritionResponse = z.infer<typeof GeminiNutritionResponseSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(40).optional(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const MealLogSummarySchema = z.object({
  id: z.string(),
  created_at: z.string(),
  dish: z.string(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
  calories: z.number(),
  meal_tag: z.string().nullable(),
  image_url: z.string().url().nullable(),
  ai_raw: GeminiNutritionResponseSchema.optional(),
});

export type MealLogSummary = z.infer<typeof MealLogSummarySchema>;

export const MealLogDetailSchema = z.object({
  id: z.string(),
  food_item: z.string(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
  calories: z.number(),
  ai_raw: GeminiNutritionResponseSchema.nullable(),
});

export type MealLogDetail = z.infer<typeof MealLogDetailSchema>;

export const ApiSuccessSchema = z.object({ ok: z.literal(true) });
export const ApiErrorSchema = z.object({ ok: z.literal(false), error: z.string().optional() });

export const DebugAiResponseSchema = z.object({
  ok: z.boolean(),
  key_tail: z.string(),
  attempts: z.array(HedgeAttemptReportSchema),
  activeModel: z.string().optional(),
  pingLatencyMs: z.number().optional(),
});

export const AiTimeoutConfigSchema = z.object({
  AI_ATTEMPT_TIMEOUT_MS: z.coerce.number().default(25000),
  AI_TOTAL_TIMEOUT_MS: z.coerce.number().default(35000),
  AI_HEDGE_DELAY_MS: z.coerce.number().default(5000),
  AI_MAX_ATTEMPTS: z.coerce.number().min(1).max(5).default(2),
});

export type AiTimeoutConfig = z.infer<typeof AiTimeoutConfigSchema>;

export const SlotSelectionRequestSchema = z.object({
  logId: z.string(),
  key: z.string(),
  value: z.any(),
  prevVersion: z.number(),
});

export type SlotSelectionRequest = z.infer<typeof SlotSelectionRequestSchema>;
