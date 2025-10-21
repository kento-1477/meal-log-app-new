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
    target_calories: profile.targetCalories,
    target_protein_g: profile.targetProteinG,
    target_fat_g: profile.targetFatG,
    target_carbs_g: profile.targetCarbsG,
    body_weight_kg: profile.bodyWeightKg,
    activity_level: profile.activityLevel,
    language: profile.language,
    updated_at: profile.updatedAt.toISOString(),
  });
}

function mapProfileInput(input: UpdateUserProfileRequest) {
  return {
    targetCalories: input.target_calories ?? null,
    targetProteinG: input.target_protein_g ?? null,
    targetFatG: input.target_fat_g ?? null,
    targetCarbsG: input.target_carbs_g ?? null,
    bodyWeightKg: input.body_weight_kg ?? null,
    activityLevel: input.activity_level ?? null,
    language: input.language ?? null,
  } satisfies Record<string, unknown>;
}
