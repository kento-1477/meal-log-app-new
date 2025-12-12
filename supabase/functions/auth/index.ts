import { AppleAuthRequestSchema } from '@shared/index.js';
import bcrypt from 'bcryptjs';
import { createApp, HTTP_STATUS, HttpError, handleError } from '../_shared/http.ts';
import { clearAuth, getAuthSession, persistAuth, signUserToken } from '../_shared/auth.ts';
import { evaluateAiUsage, summarizeUsageStatus } from '../_shared/ai.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getEnv } from '../_shared/env.ts';

const app = createApp();
const BCRYPT_SALT_ROUNDS = 10;

// Explicitly register routes for both plain and function-prefixed paths
const APPLE_LOGIN_PATHS = ['/login/apple', '/api/login/apple', '/auth/login/apple', '/auth/api/login/apple'] as const;
const LOGOUT_PATHS = ['/logout', '/api/logout', '/auth/logout', '/auth/api/logout'] as const;
const SESSION_PATHS = ['/session', '/api/session', '/auth/session', '/auth/api/session'] as const;

const appleAudience = getEnv('APPLE_SERVICE_ID', { optional: true })?.split(',').map((value) => value.trim()).filter(Boolean);
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

async function verifyAppleIdentityToken(identityToken: string) {
  if (!appleAudience || appleAudience.length === 0) {
    throw new HttpError('Appleサインインの設定が不足しています', {
      status: HTTP_STATUS.INTERNAL_ERROR,
      code: 'auth.apple_missing_audience',
    });
  }

  let payload: any;
  try {
    const verified = await jwtVerify(identityToken, appleJwks, {
      issuer: 'https://appleid.apple.com',
      audience: appleAudience,
    });
    payload = verified.payload;
  } catch (error) {
    console.error('apple jwt verify failed', {
      audience: appleAudience,
      error,
    });
    throw new HttpError('Appleの認証情報を確認できませんでした。設定とApple IDをもう一度確認してください。', {
      status: HTTP_STATUS.UNAUTHORIZED,
      code: 'auth.apple_invalid',
      expose: true,
    });
  }

  const sub = payload.sub;
  const email = typeof payload.email === 'string' ? payload.email : null;
  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === 'true' ||
    payload.email_verified === '1';

  if (!sub) {
    throw new HttpError('Appleの認証情報を検証できませんでした', {
      status: HTTP_STATUS.UNAUTHORIZED,
      code: 'auth.apple_invalid',
      expose: true,
    });
  }

  return { sub, email, emailVerified };
}

const handleAppleLogin = async (c: Hono.Context) => {
  try {
    console.log('apple login called', c.req.url);
    const body = await c.req.json();
    console.log('apple login body received', {
      hasIdentityToken: !!body.identityToken,
      tokenLength: body.identityToken?.length,
      tokenPreview: body.identityToken?.substring(0, 100),
      tokenDots: body.identityToken?.split('.').length,
    });
    const input = AppleAuthRequestSchema.parse(body);
    const verified = await verifyAppleIdentityToken(input.identityToken);
    const email = input.email ?? verified.email ?? null;

    const result = await upsertAppleUser({
      sub: verified.sub,
      email,
    });

    const user = result.user;
    const token = await signUserToken(user);
    persistAuth(c, token);

    const usageStatus = await evaluateAiUsage(user.id);
    const onboarding = await getOnboardingStatus(user.id);

    return c.json({
      message: 'ログインに成功しました',
      user,
      usage: summarizeUsageStatus(usageStatus),
      onboarding,
    });
  } catch (err) {
    console.error('apple login error', err);
    return handleError(c, err);
  }
};

const handleLogout = async (c: Hono.Context) => {
  clearAuth(c);
  return c.json({ message: 'ログアウトしました' });
};

const handleSession = async (c: Hono.Context) => {
  const session = await getAuthSession(c);
  if (!session) {
    clearAuth(c);
    return c.json({ authenticated: false }, HTTP_STATUS.UNAUTHORIZED);
  }

  const { data: record, error } = await supabaseAdmin
    .from('User')
    .select('id, email, aiCredits, appleSub, appleEmail')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('session: failed to fetch user', error);
    throw new HttpError('ユーザー情報の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (!record) {
    clearAuth(c);
    return c.json({ authenticated: false }, HTTP_STATUS.UNAUTHORIZED);
  }

  const user = serializeUser(record);
  const usageStatus = await evaluateAiUsage(user.id);
  const onboarding = await getOnboardingStatus(user.id);

  // Refresh token with up-to-date credit info
  const token = await signUserToken(user);
  persistAuth(c, token);

  return c.json({
    authenticated: true,
    user,
    usage: summarizeUsageStatus(usageStatus),
    onboarding,
  });
};

APPLE_LOGIN_PATHS.forEach((path) => app.post(path, (c) => handleAppleLogin(c)));
LOGOUT_PATHS.forEach((path) => app.post(path, (c) => handleLogout(c)));
SESSION_PATHS.forEach((path) => app.get(path, (c) => handleSession(c)));

// Fallback to handle OPTIONS preflight without hitting error handler
app.options('*', (c) => c.text('ok'));

export default app;

interface DbUser {
  id: number;
  email: string;
  aiCredits: number | null;
  appleSub?: string | null;
  appleEmail?: string | null;
  passwordHash?: string | null;
}

async function upsertAppleUser(input: { sub: string; email: string | null }): Promise<{ user: ReturnType<typeof serializeUser> }> {
  const nowIso = new Date().toISOString();
  const existingBySub = await supabaseAdmin
    .from('User')
    .select('id, email, aiCredits, appleSub, appleEmail')
    .eq('appleSub', input.sub)
    .maybeSingle();

  if (existingBySub.error) {
    console.error('apple login: failed to fetch by sub', existingBySub.error);
    throw new HttpError('ログインに失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (existingBySub.data) {
    return { user: serializeUser(existingBySub.data) };
  }

  if (!input.email) {
    throw new HttpError('Appleからメールアドレスを取得できませんでした。最初のログインではメール共有を許可してください。', {
      status: HTTP_STATUS.BAD_REQUEST,
      code: 'auth.apple_missing_email',
      expose: true,
    });
  }

  const existingByEmail = await supabaseAdmin
    .from('User')
    .select('id, email, aiCredits, appleSub, appleEmail')
    .eq('email', input.email)
    .maybeSingle();

  if (existingByEmail.error) {
    console.error('apple login: failed to fetch by email', existingByEmail.error);
    throw new HttpError('ログインに失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  if (existingByEmail.data) {
    if (existingByEmail.data.appleSub && existingByEmail.data.appleSub !== input.sub) {
      throw new HttpError('このメールアドレスには別のAppleアカウントが紐づいています。Apple IDを確認してもう一度お試しください。', {
        status: HTTP_STATUS.CONFLICT,
        code: 'auth.apple_conflict',
        expose: true,
      });
    }

    const updated = await supabaseAdmin
      .from('User')
      .update({
        appleSub: input.sub,
        appleEmail: input.email,
        appleLinkedAt: nowIso,
        updatedAt: nowIso,
      })
      .eq('id', existingByEmail.data.id)
      .select('id, email, aiCredits, appleSub, appleEmail')
      .single();

    if (updated.error || !updated.data) {
      console.error('apple login: failed to update existing user', updated.error);
      throw new HttpError('ログインに失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }

    return { user: serializeUser(updated.data) };
  }

  const randomPassword = crypto.randomUUID();
  const passwordHash = await hashPassword(randomPassword);

  const inserted = await supabaseAdmin
    .from('User')
    .insert({
      email: input.email,
      passwordHash,
      aiCredits: 0,
      appleSub: input.sub,
      appleEmail: input.email,
      appleLinkedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .select('id, email, aiCredits, appleSub, appleEmail')
    .single();

  if (inserted.error || !inserted.data) {
    console.error('apple login: failed to create user', inserted.error);
    throw new HttpError('ログインに失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  return { user: serializeUser(inserted.data) };
}

async function getOnboardingStatus(userId: number) {
  const { data, error } = await supabaseAdmin
    .from('UserProfile')
    .select('questionnaireCompletedAt')
    .eq('userId', userId)
    .maybeSingle();

  if (error) {
    console.error('getOnboardingStatus: failed to fetch profile', error);
    throw new HttpError('ユーザー情報の取得に失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
  }

  const completedAt = data?.questionnaireCompletedAt ? new Date(data.questionnaireCompletedAt) : null;
  return {
    completed: Boolean(completedAt),
    completed_at: completedAt ? completedAt.toISOString() : null,
  };
}

function serializeUser(row: DbUser) {
  return {
    id: row.id,
    email: row.email,
    aiCredits: row.aiCredits ?? 0,
    appleLinked: Boolean(row.appleSub),
    appleEmail: row.appleEmail ?? null,
  };
}

async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}
