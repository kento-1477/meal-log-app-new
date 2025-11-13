import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  UserProfileSchema,
  UpdateUserProfileRequestSchema,
  computeNutritionPlan,
  type NutritionPlanInput,
  type UpdateUserProfileRequest,
} from '@meal-log/shared';
import type { UserProfile as PrismaUserProfile } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/require-auth.js';
import { claimReferralCode, generateDeviceFingerprint } from '../services/referral-service.js';
import { logger } from '../logger.js';
import { invalidateDashboardCacheForUser } from '../services/dashboard-service.js';

export const profileRouter = Router();

profileRouter.use(requireAuth);

if (process.env.NODE_ENV !== 'production') {
  console.log('[profileRouter] registered');
}

profileRouter.get('/profile', async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    let profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      profile = await prisma.userProfile.create({ data: { userId } });
    }
    const payload = serializeProfile(profile);
    res.status(StatusCodes.OK).json({ ok: true, profile: payload });
  } catch (error) {
    next(error);
  }
});

profileRouter.put('/profile', async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const parsed = UpdateUserProfileRequestSchema.parse(req.body);
    const existing = await prisma.userProfile.findUnique({ where: { userId } });
    const { auto_recalculate: autoRecalculate, ...rest } = parsed;
    const updateData = mapProfileInput(rest);

    const nutritionInput: NutritionPlanInput = {
      gender: hasOwn(rest, 'gender') ? rest.gender ?? null : existing?.gender ?? null,
      birthdate: hasOwn(rest, 'birthdate') ? rest.birthdate ?? null : existing?.birthdate ?? null,
      heightCm: hasOwn(rest, 'height_cm') ? rest.height_cm ?? null : existing?.heightCm ?? null,
      currentWeightKg: hasOwn(rest, 'current_weight_kg')
        ? rest.current_weight_kg ?? null
        : existing?.currentWeightKg ?? existing?.bodyWeightKg ?? null,
      targetWeightKg: hasOwn(rest, 'target_weight_kg')
        ? rest.target_weight_kg ?? null
        : existing?.targetWeightKg ?? null,
      activityLevel: hasOwn(rest, 'activity_level') ? rest.activity_level ?? null : existing?.activityLevel ?? null,
      planIntensity: hasOwn(rest, 'plan_intensity') ? rest.plan_intensity ?? null : existing?.planIntensity ?? null,
      goals: hasOwn(rest, 'goals') ? rest.goals ?? [] : existing?.goals ?? [],
    };

    const userProvidedTargets =
      hasOwn(rest, 'target_calories') ||
      hasOwn(rest, 'target_protein_g') ||
      hasOwn(rest, 'target_fat_g') ||
      hasOwn(rest, 'target_carbs_g');
    const hasPersistedTargets = hasMacroTargets(existing);
    const hasPlanInputs = canComputeNutritionPlan(nutritionInput);

    const shouldAutoPopulateTargets = !userProvidedTargets && !hasPersistedTargets && hasPlanInputs;
    const shouldRecalculate = Boolean(autoRecalculate);
    if (shouldRecalculate || shouldAutoPopulateTargets) {
      const autoPlan = computeNutritionPlan(nutritionInput);
      if (!autoPlan) {
        if (shouldRecalculate) {
          const error = new Error('Unable to recalculate nutrition targets with the provided values');
          Object.assign(error, { statusCode: StatusCodes.BAD_REQUEST, expose: true });
          throw error;
        }
      } else {
        updateData.targetCalories = autoPlan.targetCalories;
        updateData.targetProteinG = autoPlan.proteinGrams;
        updateData.targetFatG = autoPlan.fatGrams;
        updateData.targetCarbsG = autoPlan.carbGrams;
      }
    }

    let referralClaimed = false;
    let referralResult: { premiumDays: number; premiumUntil: string; referrerUsername: string | null } | null = null;

    const referralCode = hasOwn(rest, 'marketing_referral_code') ? rest.marketing_referral_code ?? null : null;

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: updateData,
      create: { userId, ...updateData },
    });

    if (referralCode) {
      try {
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const deviceFingerprint = generateDeviceFingerprint(ip, userAgent);
        const result = await claimReferralCode({ userId, code: referralCode, deviceFingerprint });
        referralClaimed = true;
        referralResult = result;
      } catch (error) {
        logger.warn({ userId, referralCode, error }, 'Failed to auto-claim referral code from profile update');
      }
    }

    invalidateDashboardCacheForUser(userId);

    const payload = serializeProfile(profile);
    res.status(StatusCodes.OK).json({
      ok: true,
      profile: payload,
      referralClaimed,
      referralResult,
    });
  } catch (error) {
    next(error);
  }
});

function serializeProfile(profile: PrismaUserProfile) {
  return UserProfileSchema.parse({
    display_name: profile.displayName ?? null,
    gender: profile.gender ?? null,
    birthdate: toIsoOrNull(profile.birthdate),
    height_cm: profile.heightCm ?? null,
    unit_preference: profile.unitPreference ?? null,
    marketing_source: profile.marketingSource ?? null,
    marketing_referral_code: profile.referralCode ?? null,
    goals: profile.goals ?? [],
    target_calories: profile.targetCalories,
    target_protein_g: profile.targetProteinG,
    target_fat_g: profile.targetFatG,
    target_carbs_g: profile.targetCarbsG,
    body_weight_kg: profile.bodyWeightKg,
    current_weight_kg: profile.currentWeightKg ?? null,
    target_weight_kg: profile.targetWeightKg ?? null,
    plan_intensity: profile.planIntensity ?? null,
    target_date: toIsoOrNull(profile.targetDate),
    activity_level: profile.activityLevel ?? null,
    apple_health_linked: profile.appleHealthLinked ?? false,
    questionnaire_completed_at: toIsoOrNull(profile.questionnaireCompletedAt),
    language: profile.language,
    updated_at: profile.updatedAt.toISOString(),
  });
}

function mapProfileInput(input: UpdateUserProfileRequest) {
  const data: Record<string, unknown> = {};

  if (hasOwn(input, 'display_name')) {
    data.displayName = input.display_name ?? null;
  }
  if (hasOwn(input, 'gender')) {
    data.gender = input.gender ?? null;
  }
  if (hasOwn(input, 'birthdate')) {
    data.birthdate = input.birthdate ? new Date(input.birthdate) : null;
  }
  if (hasOwn(input, 'height_cm')) {
    data.heightCm = input.height_cm ?? null;
  }
  if (hasOwn(input, 'unit_preference')) {
    data.unitPreference = input.unit_preference ?? null;
  }
  if (hasOwn(input, 'marketing_source')) {
    data.marketingSource = input.marketing_source ?? null;
  }
  if (hasOwn(input, 'marketing_referral_code')) {
    data.referralCode = input.marketing_referral_code ?? null;
  }
  if (hasOwn(input, 'goals')) {
    data.goals = input.goals ?? [];
  }
  if (hasOwn(input, 'target_calories')) {
    data.targetCalories = input.target_calories ?? null;
  }
  if (hasOwn(input, 'target_protein_g')) {
    data.targetProteinG = input.target_protein_g ?? null;
  }
  if (hasOwn(input, 'target_fat_g')) {
    data.targetFatG = input.target_fat_g ?? null;
  }
  if (hasOwn(input, 'target_carbs_g')) {
    data.targetCarbsG = input.target_carbs_g ?? null;
  }
  if (hasOwn(input, 'body_weight_kg')) {
    data.bodyWeightKg = input.body_weight_kg ?? null;
  }
  if (hasOwn(input, 'current_weight_kg')) {
    data.currentWeightKg = input.current_weight_kg ?? null;
  }
  if (hasOwn(input, 'target_weight_kg')) {
    data.targetWeightKg = input.target_weight_kg ?? null;
  }
  if (hasOwn(input, 'plan_intensity')) {
    data.planIntensity = input.plan_intensity ?? null;
  }
  if (hasOwn(input, 'target_date')) {
    data.targetDate = input.target_date ? new Date(input.target_date) : null;
  }
  if (hasOwn(input, 'activity_level')) {
    data.activityLevel = input.activity_level ?? null;
  }
  if (hasOwn(input, 'apple_health_linked')) {
    // TODO: Apple Health 連携は将来対応予定。現段階ではフラグのみ維持する。
    data.appleHealthLinked = input.apple_health_linked ?? false;
  }
  if (hasOwn(input, 'questionnaire_completed_at')) {
    data.questionnaireCompletedAt = input.questionnaire_completed_at
      ? new Date(input.questionnaire_completed_at)
      : null;
  }
  if (hasOwn(input, 'language')) {
    data.language = input.language ?? null;
  }

  return data;
}

function toIsoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function hasOwn<T extends object>(obj: T, key: keyof UpdateUserProfileRequest) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function hasMacroTargets(profile: PrismaUserProfile | null | undefined) {
  if (!profile) return false;
  return [profile.targetCalories, profile.targetProteinG, profile.targetFatG, profile.targetCarbsG].every(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );
}

function canComputeNutritionPlan(input: NutritionPlanInput) {
  return Boolean(
    input &&
      input.gender &&
      input.birthdate &&
      input.heightCm &&
      input.currentWeightKg &&
      input.activityLevel &&
      input.planIntensity,
  );
}
