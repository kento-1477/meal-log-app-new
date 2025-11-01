import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  UserProfileSchema,
  UpdateUserProfileRequestSchema,
  type UpdateUserProfileRequest,
} from '@meal-log/shared';
import type { UserProfile as PrismaUserProfile } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/require-auth.js';

export const profileRouter = Router();

profileRouter.use(requireAuth);

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
    const updateData = mapProfileInput(parsed);
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: updateData,
      create: { userId, ...updateData },
    });
    const payload = serializeProfile(profile);
    res.status(StatusCodes.OK).json({ ok: true, profile: payload });
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
