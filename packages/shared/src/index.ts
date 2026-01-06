import { z } from 'zod';

export const LocaleSchema = z
  .string()
  .min(2)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'Locale must follow BCP 47 format');

export type Locale = z.infer<typeof LocaleSchema>;

export const GenderSchema = z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'UNSPECIFIED']);
export type Gender = z.infer<typeof GenderSchema>;

export const MeasurementSystemSchema = z.enum(['METRIC', 'IMPERIAL']);
export type MeasurementSystem = z.infer<typeof MeasurementSystemSchema>;

export const ActivityLevelSchema = z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'ATHLETE']);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;

export const PlanIntensitySchema = z.enum(['GENTLE', 'STANDARD', 'INTENSE']);
export type PlanIntensity = z.infer<typeof PlanIntensitySchema>;

export const ActivityLevelStringSchema = z.union([ActivityLevelSchema, z.string().min(1).max(40)]);
export type ActivityLevelString = z.infer<typeof ActivityLevelStringSchema>;

export const MAX_GOAL_SELECTION = 3;

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
      model: z.string().optional(),
      fallback_model_used: z.boolean().optional(),
      attempt: z.number().optional(),
      latencyMs: z.number().nonnegative().optional(),
      attemptReports: z.array(HedgeAttemptReportSchema).optional(),
      favoriteId: z.number().int().optional(),
      translation: z
        .object({
          locale: LocaleSchema,
          sourceLocale: LocaleSchema.optional(),
        })
        .optional(),
      sourceMealLogId: z.string().optional(),
    })
    .optional(),
});

export type GeminiNutritionResponse = z.infer<typeof GeminiNutritionResponseSchema>;

export const FavoriteMealItemInputSchema = z.object({
  name: z.string().min(1),
  grams: z.number().nonnegative(),
  calories: z.number().nonnegative().optional().nullable(),
  protein_g: z.number().nonnegative().optional().nullable(),
  fat_g: z.number().nonnegative().optional().nullable(),
  carbs_g: z.number().nonnegative().optional().nullable(),
  order_index: z.number().int().nonnegative().optional(),
});

export type FavoriteMealItemInput = z.infer<typeof FavoriteMealItemInputSchema>;

export const FavoriteMealItemSchema = FavoriteMealItemInputSchema.extend({
  id: z.number().int(),
  order_index: z.number().int().nonnegative(),
});

export type FavoriteMealItem = z.infer<typeof FavoriteMealItemSchema>;

export const FavoriteMealDraftSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional().nullable(),
  totals: NutritionTotalsSchema,
  items: z.array(FavoriteMealItemInputSchema),
  source_log_id: z.string().optional().nullable(),
});

export type FavoriteMealDraft = z.infer<typeof FavoriteMealDraftSchema>;

export const FavoriteMealSchema = FavoriteMealDraftSchema.extend({
  id: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(FavoriteMealItemSchema),
});

export type FavoriteMeal = z.infer<typeof FavoriteMealSchema>;

export const FavoriteMealListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(FavoriteMealSchema),
});

export const FavoriteMealDetailResponseSchema = z.object({
  ok: z.literal(true),
  item: FavoriteMealSchema,
});

export const FavoriteMealCreateRequestSchema = FavoriteMealDraftSchema;
export type FavoriteMealCreateRequest = z.infer<typeof FavoriteMealCreateRequestSchema>;

export const FavoriteMealUpdateRequestSchema = FavoriteMealDraftSchema.partial().extend({
  items: z.array(FavoriteMealItemInputSchema).optional(),
  totals: NutritionTotalsSchema.optional(),
});

export type FavoriteMealUpdateRequest = z.infer<typeof FavoriteMealUpdateRequestSchema>;

export const MealLogAiRawSchema = GeminiNutritionResponseSchema.extend({
  locale: LocaleSchema.optional(),
  translations: z.record(LocaleSchema, GeminiNutritionResponseSchema).optional(),
});

export type MealLogAiRaw = z.infer<typeof MealLogAiRawSchema>;

export const MealPeriodSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealPeriod = z.infer<typeof MealPeriodSchema>;

export const IapPlatformSchema = z.enum(['APP_STORE', 'GOOGLE_PLAY']);
export type IapPlatform = z.infer<typeof IapPlatformSchema>;

export const IapEnvironmentSchema = z.enum(['sandbox', 'production']);
export type IapEnvironment = z.infer<typeof IapEnvironmentSchema>;

export const IAP_CREDIT_PRODUCT_ID = 'com.meallog.credits.100';
export const IAP_PREMIUM_PRODUCT_ID = 'com.meallog.premium.annual';
export const IAP_PREMIUM_MONTHLY_PRODUCT_ID = 'com.meallog.premium.monthly';

export interface IapProductDefinition {
  productId: string;
  credits?: number;
  premiumDays?: number;
}

export const IAP_PRODUCTS: readonly IapProductDefinition[] = [
  { productId: IAP_CREDIT_PRODUCT_ID, credits: 100 },
  { productId: IAP_PREMIUM_PRODUCT_ID, premiumDays: 365 },
  { productId: IAP_PREMIUM_MONTHLY_PRODUCT_ID, premiumDays: 30 },
];

export type IapProduct = (typeof IAP_PRODUCTS)[number];

export function resolveIapProduct(productId: string): IapProduct | null {
  return IAP_PRODUCTS.find((item) => item.productId === productId) ?? null;
}

export function resolveCreditsForProduct(productId: string): number | null {
  const entry = resolveIapProduct(productId);
  return typeof entry?.credits === 'number' ? entry.credits : null;
}

export function resolvePremiumDaysForProduct(productId: string): number | null {
  const entry = resolveIapProduct(productId);
  return typeof entry?.premiumDays === 'number' ? entry.premiumDays : null;
}

export const UserTierSchema = z.enum(['FREE', 'PREMIUM']);
export type UserTier = z.infer<typeof UserTierSchema>;

export const PremiumSourceSchema = z.enum(['REFERRAL_FRIEND', 'REFERRAL_REFERRER', 'PURCHASE', 'ADMIN_GRANT']);
export type PremiumSource = z.infer<typeof PremiumSourceSchema>;

export const PremiumGrantSchema = z.object({
  source: PremiumSourceSchema,
  days: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
  createdAt: z.string().optional(),
});

export type PremiumGrant = z.infer<typeof PremiumGrantSchema>;

export const PremiumStatusSchema = z.object({
  isPremium: z.boolean(),
  source: PremiumSourceSchema.nullable(),
  daysRemaining: z.number().int().nonnegative(),
  expiresAt: z.string().nullable(),
  grants: z.array(PremiumGrantSchema).default([]),
});

export type PremiumStatus = z.infer<typeof PremiumStatusSchema>;

export const AiUsageSummarySchema = z.object({
  plan: UserTierSchema,
  limit: z.number().nonnegative(),
  used: z.number().nonnegative(),
  remaining: z.number().nonnegative(),
  credits: z.number().int().nonnegative(),
  consumedCredit: z.boolean(),
  resetsAt: z.string(),
});

export type AiUsageSummary = z.infer<typeof AiUsageSummarySchema>;

export const IapPurchaseRequestSchema = z.object({
  platform: IapPlatformSchema,
  productId: z.string().min(1),
  transactionId: z.string().min(1),
  receiptData: z.string().min(1),
  environment: IapEnvironmentSchema.optional(),
  quantity: z.number().int().positive().optional(),
});

export type IapPurchaseRequest = z.infer<typeof IapPurchaseRequestSchema>;

export const IapPurchaseResponseSchema = z.object({
  ok: z.literal(true),
  creditsGranted: z.number().int().nonnegative(),
  usage: AiUsageSummarySchema,
  premiumStatus: PremiumStatusSchema,
});

export type IapPurchaseResponse = z.infer<typeof IapPurchaseResponseSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const AppleAuthRequestSchema = z.object({
  identityToken: z.string().min(10),
  authorizationCode: z.string().min(4).optional(),
  email: z.string().email().optional(),
  fullName: z.string().optional(),
});

export type AppleAuthRequest = z.infer<typeof AppleAuthRequestSchema>;

export const AppleLinkRequestSchema = AppleAuthRequestSchema.extend({
  userAgent: z.string().optional(),
});

export type AppleLinkRequest = z.infer<typeof AppleLinkRequestSchema>;

export const MealLogSummarySchema = z.object({
  id: z.string(),
  created_at: z.string(),
  dish: z.string(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
  calories: z.number(),
  meal_period: MealPeriodSchema.nullable(),
  image_url: z.string().url().nullable(),
  thumbnail_url: z.string().url().nullable(),
  ai_raw: MealLogAiRawSchema.optional(),
  locale: LocaleSchema.optional(),
  requested_locale: LocaleSchema.optional(),
  fallback_applied: z.boolean().optional(),
  favorite_meal_id: z.number().int().nullable().optional(),
});

export type MealLogSummary = z.infer<typeof MealLogSummarySchema>;

export const MealLogRangeSchema = z.enum(['today', 'week', 'twoWeeks', 'threeWeeks', 'month', 'threeMonths']);
export type MealLogRange = z.infer<typeof MealLogRangeSchema>;

export const MealLogListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(MealLogSummarySchema),
  range: MealLogRangeSchema.optional(),
  timezone: z.string().optional(),
});

export type MealLogListResponse = z.infer<typeof MealLogListResponseSchema>;

export const MealLogEditEntrySchema = z.object({
  id: z.number(),
  created_at: z.string(),
  user_id: z.number(),
  user_email: z.string().email().nullable(),
  user_name: z.string().nullable(),
  changes: z.record(z.any()),
});

export type MealLogEditEntry = z.infer<typeof MealLogEditEntrySchema>;

export const MealPeriodHistoryEntrySchema = z.object({
  id: z.number().int(),
  changed_at: z.string(),
  previous: MealPeriodSchema.nullable(),
  next: MealPeriodSchema.nullable(),
  source: z.string(),
});

export type MealPeriodHistoryEntry = z.infer<typeof MealPeriodHistoryEntrySchema>;

export const MealLogDetailSchema = z.object({
  id: z.string(),
  food_item: z.string(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
  calories: z.number(),
  meal_period: MealPeriodSchema.nullable(),
  created_at: z.string(),
  image_url: z.string().url().nullable(),
  ai_raw: MealLogAiRawSchema.nullable(),
  locale: LocaleSchema.optional(),
  requested_locale: LocaleSchema.optional(),
  fallback_applied: z.boolean().optional(),
  favorite_meal_id: z.number().int().nullable().optional(),
  history: z.array(MealLogEditEntrySchema),
  time_history: z.array(MealPeriodHistoryEntrySchema),
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

export const UpdateMealLogRequestSchema = z
  .object({
    food_item: z.string().min(1).optional(),
    calories: z.coerce.number().nonnegative().optional(),
    protein_g: z.coerce.number().nonnegative().optional(),
    fat_g: z.coerce.number().nonnegative().optional(),
    carbs_g: z.coerce.number().nonnegative().optional(),
    meal_period: MealPeriodSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateMealLogRequest = z.infer<typeof UpdateMealLogRequestSchema>;

export const MealPeriodFilterSchema = z.enum(['today', 'yesterday', 'thisWeek', 'lastWeek', 'custom']);
export type DashboardPeriod = z.infer<typeof MealPeriodFilterSchema>;

const MealPeriodCaloriesSchema = z.object({
  date: z.string(),
  total: z.number(),
  perMealPeriod: z.object({
    breakfast: z.number(),
    lunch: z.number(),
    dinner: z.number(),
    snack: z.number(),
    unknown: z.number(),
  }),
});

const MacroTotalsSchema = z.object({
  calories: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
});

export const DashboardSummarySchema = z.object({
  period: MealPeriodFilterSchema,
  range: z.object({
    from: z.string(),
    to: z.string(),
    timezone: z.string(),
  }),
  calories: z.object({
    daily: z.array(MealPeriodCaloriesSchema),
    remainingToday: MacroTotalsSchema,
  }),
  macros: z.object({
    total: MacroTotalsSchema,
    targets: MacroTotalsSchema,
    delta: MacroTotalsSchema,
  }),
  micros: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      unit: z.string(),
      total: z.number(),
      target: z.number(),
      delta: z.number(),
    }),
  ),
  metadata: z.object({
    generatedAt: z.string(),
  }),
});

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const DashboardTargetsSchema = MacroTotalsSchema;
export type DashboardTargets = z.infer<typeof DashboardTargetsSchema>;

export const CalorieTrendPointSchema = z.object({
  date: z.string(),
  label: z.string(),
  value: z.number(),
});

export const CalorieTrendResponseSchema = z.object({
  target: z.number(),
  points: z.array(CalorieTrendPointSchema),
});

export type CalorieTrendPoint = z.infer<typeof CalorieTrendPointSchema>;
export type CalorieTrendResponse = z.infer<typeof CalorieTrendResponseSchema>;

export const UserProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(80).nullable().optional(),
  gender: GenderSchema.nullable().optional(),
  birthdate: z.string().datetime().nullable().optional(),
  height_cm: z.number().nonnegative().nullable().optional(),
  unit_preference: MeasurementSystemSchema.nullable().optional(),
  marketing_source: z.string().trim().min(1).max(80).nullable().optional(),
  marketing_referral_code: z.string().trim().min(1).max(80).nullable().optional(),
  goals: z
    .array(z.string().trim().min(1).max(40))
    .max(MAX_GOAL_SELECTION)
    .nullable()
    .optional(),
  target_calories: z.number().int().nonnegative().nullable().optional(),
  target_protein_g: z.number().nonnegative().nullable().optional(),
  target_fat_g: z.number().nonnegative().nullable().optional(),
  target_carbs_g: z.number().nonnegative().nullable().optional(),
  body_weight_kg: z.number().nonnegative().nullable().optional(),
  current_weight_kg: z.number().nonnegative().nullable().optional(),
  target_weight_kg: z.number().nonnegative().nullable().optional(),
  plan_intensity: PlanIntensitySchema.nullable().optional(),
  target_date: z.string().datetime().nullable().optional(),
  activity_level: ActivityLevelStringSchema.nullable().optional(),
  apple_health_linked: z.boolean().optional(),
  questionnaire_completed_at: z.string().datetime().nullable().optional(),
  language: LocaleSchema.nullable().optional(),
  updated_at: z.string().optional(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UserProfileResponseSchema = z.object({
  ok: z.literal(true),
  profile: UserProfileSchema,
  referralClaimed: z.boolean().optional(),
  referralResult: z
    .object({
      premiumDays: z.number().int().nonnegative(),
      premiumUntil: z.string().datetime(),
      referrerUsername: z.string().nullable(),
    })
    .optional()
    .nullable(),
});

export const UpdateUserProfileRequestSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).nullable().optional(),
    gender: GenderSchema.nullable().optional(),
    birthdate: z.string().datetime().nullable().optional(),
    height_cm: z.number().nonnegative().nullable().optional(),
    unit_preference: MeasurementSystemSchema.nullable().optional(),
    marketing_source: z.string().trim().min(1).max(80).nullable().optional(),
    marketing_referral_code: z.string().trim().min(1).max(80).nullable().optional(),
    goals: z
      .array(z.string().trim().min(1).max(40))
      .max(MAX_GOAL_SELECTION)
      .nullable()
      .optional(),
    target_calories: z.number().int().nonnegative().nullable().optional(),
    target_protein_g: z.number().nonnegative().nullable().optional(),
    target_fat_g: z.number().nonnegative().nullable().optional(),
    target_carbs_g: z.number().nonnegative().nullable().optional(),
    body_weight_kg: z.number().nonnegative().nullable().optional(),
    current_weight_kg: z.number().nonnegative().nullable().optional(),
    target_weight_kg: z.number().nonnegative().nullable().optional(),
    plan_intensity: PlanIntensitySchema.nullable().optional(),
    target_date: z.string().datetime().nullable().optional(),
    activity_level: ActivityLevelStringSchema.nullable().optional(),
    apple_health_linked: z.boolean().optional(),
    questionnaire_completed_at: z.string().datetime().nullable().optional(),
    language: LocaleSchema.nullable().optional(),
    auto_recalculate: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateUserProfileRequest = z.infer<typeof UpdateUserProfileRequestSchema>;

export const NotificationSettingsSchema = z.object({
  reminder_enabled: z.boolean(),
  important_enabled: z.boolean(),
  quiet_hours_start: z.number().int().min(0).max(1439),
  quiet_hours_end: z.number().int().min(0).max(1439),
  daily_cap: z.number().int().min(1).max(5),
  timezone: z.string().min(1),
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const NotificationSettingsResponseSchema = z.object({
  ok: z.literal(true),
  settings: NotificationSettingsSchema,
});

export type NotificationSettingsResponse = z.infer<typeof NotificationSettingsResponseSchema>;

export const NotificationSettingsUpdateRequestSchema = NotificationSettingsSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'At least one field must be provided',
  },
);

export type NotificationSettingsUpdateRequest = z.infer<typeof NotificationSettingsUpdateRequestSchema>;

export const PushTokenRegisterRequestSchema = z.object({
  expo_token: z.string().min(1),
  device_id: z.string().min(1),
  platform: z.enum(['IOS']),
  locale: z.string().min(1).max(20).optional().nullable(),
  timezone: z.string().min(1).max(60).optional().nullable(),
});

export type PushTokenRegisterRequest = z.infer<typeof PushTokenRegisterRequestSchema>;

export const PushTokenDisableRequestSchema = z.object({
  device_id: z.string().min(1),
});

export type PushTokenDisableRequest = z.infer<typeof PushTokenDisableRequestSchema>;

export const OnboardingStatusSchema = z.object({
  completed: z.boolean(),
  completed_at: z.string().datetime().nullable().optional(),
});

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

export * from './health.js';
