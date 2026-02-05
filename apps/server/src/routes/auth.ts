import { Router, type Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  AppleAuthRequestSchema,
} from '@meal-log/shared';
import type { UserProfile as PrismaUserProfile } from '@prisma/client';
import { authenticateUser, findUserById, registerUser, upsertAppleUser, linkAppleAccount } from '../services/auth-service.js';
import { evaluateAiUsage, summarizeUsageStatus } from '../services/ai-usage-service.js';
import { ZodError, ZodIssue } from 'zod';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { authRateLimiter } from '../middleware/rate-limits.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env.js';

export const authRouter = Router();
const appleAudience = (env.APPLE_SERVICE_ID ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

async function verifyAppleIdentityToken(identityToken: string) {
  if (appleAudience.length === 0) {
    const error = new Error(
      'Appleサインインの設定が不足しています（APPLE_SERVICE_ID を環境変数に設定してください）',
    ) as Error & { statusCode?: number; expose?: boolean };
    error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    throw error;
  }

  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: appleAudience,
  });

  const sub = payload.sub;
  const email = typeof payload.email === 'string' ? payload.email : null;
  if (!sub) {
    const error = new Error('Appleの認証情報を検証できませんでした') as Error & { statusCode?: number; expose?: boolean };
    error.statusCode = StatusCodes.UNAUTHORIZED;
    error.expose = true;
    throw error;
  }

  return { sub, email };
}

authRouter.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const body = RegisterRequestSchema.parse(req.body);
    const user = await registerUser(body);
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    const onboarding = await getOnboardingStatus(user.id);
    res.status(StatusCodes.CREATED).json({
      message: 'ユーザー登録が完了しました',
      user,
      usage,
      onboarding,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: formatValidationError(error, 'register'),
        code: 'VALIDATION_ERROR',
        details: error.errors,
      });
    }
    await destroySession(req);
    next(error);
  }
});

authRouter.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const body = LoginRequestSchema.parse(req.body);
    const user = await authenticateUser(body);
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    const onboarding = await getOnboardingStatus(user.id);
    res.status(StatusCodes.OK).json({
      message: 'ログインに成功しました',
      user,
      usage,
      onboarding,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: formatValidationError(error, 'login'),
        code: 'VALIDATION_ERROR',
        details: error.errors,
      });
    }
    await destroySession(req);
    next(error);
  }
});

authRouter.post('/login/apple', authRateLimiter, async (req, res, next) => {
  try {
    const body = AppleAuthRequestSchema.parse(req.body);
    const verified = await verifyAppleIdentityToken(body.identityToken);
    const email = body.email ?? verified.email ?? null;

    const user = await upsertAppleUser({ sub: verified.sub, email });
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    const onboarding = await getOnboardingStatus(user.id);
    res.status(StatusCodes.OK).json({
      message: 'ログインに成功しました',
      user,
      usage,
      onboarding,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: formatValidationError(error, 'login'),
        code: 'VALIDATION_ERROR',
        details: error.errors,
      });
    }
    await destroySession(req);
    next(error);
  }
});

authRouter.post('/link/apple', authRateLimiter, async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: '認証が必要です' });
    }
    const body = AppleAuthRequestSchema.parse(req.body);
    const verified = await verifyAppleIdentityToken(body.identityToken);
    const email = body.email ?? verified.email ?? undefined;

    const user = await linkAppleAccount(req.session.userId, { sub: verified.sub, email });
    req.session.userId = user.id;
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    const onboarding = await getOnboardingStatus(user.id);
    res.status(StatusCodes.OK).json({
      message: 'Appleアカウントをリンクしました',
      user,
      usage,
      onboarding,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: formatValidationError(error, 'login'),
        code: 'VALIDATION_ERROR',
        details: error.errors,
      });
    }
    next(error);
  }
});

function formatValidationError(error: ZodError, _type: 'register' | 'login') {
  const issue: ZodIssue | undefined = error.errors[0];
  const field = issue?.path?.[0];

  if (field === 'email') {
    return 'メールアドレスの形式が正しくありません。';
  }

  if (field === 'password') {
    if (issue?.code === 'too_small') {
      return 'パスワードが短すぎます。8文字以上で入力してください。';
    }
    return 'パスワードの入力内容を確認してください。';
  }

  return '入力内容が正しくありません。';
}

authRouter.post('/logout', async (req, res) => {
  req.session.destroy(() => {
    res.status(StatusCodes.OK).json({ message: 'ログアウトしました' });
  });
});

authRouter.get('/session', async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ authenticated: false });
    }
    const user = await findUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => undefined);
      return res.status(StatusCodes.UNAUTHORIZED).json({ authenticated: false });
    }
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    const onboarding = await getOnboardingStatus(user.id);
    return res.status(StatusCodes.OK).json({ authenticated: true, user, usage, onboarding });
  } catch (error) {
    next(error);
  }
});

async function getOnboardingStatus(userId: number) {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  const completedAt = profile?.questionnaireCompletedAt ?? null;
  if (completedAt) {
    return {
      completed: true,
      completed_at: completedAt.toISOString(),
    };
  }

  const inferredFromProfile = inferOnboardingCompletionFromProfile(profile);
  if (inferredFromProfile) {
    await safeBackfillOnboardingCompletion(userId, inferredFromProfile);
    return {
      completed: true,
      completed_at: inferredFromProfile.toISOString(),
    };
  }

  const firstLog = await prisma.mealLog.findFirst({
    where: { userId },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (firstLog?.createdAt) {
    await safeBackfillOnboardingCompletion(userId, firstLog.createdAt);
    return {
      completed: true,
      completed_at: firstLog.createdAt.toISOString(),
    };
  }

  return {
    completed: false,
    completed_at: null,
  };
}

function inferOnboardingCompletionFromProfile(profile: PrismaUserProfile | null) {
  if (!profile) return null;

  const hasSignals =
    Boolean(profile.displayName) ||
    Boolean(profile.gender) ||
    Boolean(profile.birthdate) ||
    profile.heightCm !== null ||
    Boolean(profile.marketingSource) ||
    Boolean(profile.referralCode) ||
    (profile.goals?.length ?? 0) > 0 ||
    profile.currentWeightKg !== null ||
    profile.targetWeightKg !== null ||
    profile.planIntensity !== null ||
    profile.targetDate !== null ||
    profile.activityLevel !== null ||
    profile.bodyWeightKg !== null ||
    profile.targetCalories !== null ||
    profile.targetProteinG !== null ||
    profile.targetFatG !== null ||
    profile.targetCarbsG !== null;

  if (!hasSignals) {
    return null;
  }

  return profile.updatedAt ?? new Date();
}

async function safeBackfillOnboardingCompletion(userId: number, completedAt: Date) {
  try {
    await prisma.userProfile.upsert({
      where: { userId },
      update: { questionnaireCompletedAt: completedAt },
      create: { userId, questionnaireCompletedAt: completedAt },
    });
  } catch (error) {
    logger.warn({ userId, error }, 'Failed to backfill onboarding completion');
  }
}

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function destroySession(req: Request) {
  return new Promise<void>((resolve) => {
    if (!req.session) {
      resolve();
      return;
    }
    req.session.destroy(() => resolve());
  });
}
