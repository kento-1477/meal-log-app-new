import { Router, type Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  AppleAuthRequestSchema,
} from '@meal-log/shared';
import { authenticateUser, findUserById, registerUser, upsertAppleUser, linkAppleAccount } from '../services/auth-service.js';
import { evaluateAiUsage, summarizeUsageStatus } from '../services/ai-usage-service.js';
import { ZodError, ZodIssue } from 'zod';
import { prisma } from '../db/prisma.js';
import { authRateLimiter } from '../middleware/rate-limits.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const authRouter = Router();
const appleAudience = (process.env.APPLE_SERVICE_ID ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

async function verifyAppleIdentityToken(identityToken: string) {
  if (appleAudience.length === 0) {
    const error = new Error('Appleサインインの設定が不足しています') as Error & { statusCode?: number; expose?: boolean };
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
  return {
    completed: Boolean(completedAt),
    completed_at: completedAt?.toISOString() ?? null,
  };
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
