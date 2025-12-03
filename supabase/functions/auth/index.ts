import { RegisterRequestSchema, LoginRequestSchema } from '@shared/index.js';
import bcrypt from 'bcryptjs';
import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { clearAuth, getAuthSession, persistAuth, signUserToken } from '../_shared/auth.ts';
import { evaluateAiUsage, summarizeUsageStatus } from '../_shared/ai.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';

const app = createApp();
const BCRYPT_SALT_ROUNDS = 10;

// Explicitly register routes for both plain and function-prefixed paths
const REGISTER_PATHS = ['/register', '/api/register', '/auth/register', '/auth/api/register'] as const;
const LOGIN_PATHS = ['/login', '/api/login', '/auth/login', '/auth/api/login'] as const;
const LOGOUT_PATHS = ['/logout', '/api/logout', '/auth/logout', '/auth/api/logout'] as const;
const SESSION_PATHS = ['/session', '/api/session', '/auth/session', '/auth/api/session'] as const;

const handleRegister = async (c: Hono.Context) => {
  try {
    console.log('register called', c.req.url);
    console.log('env check', {
      DATABASE_URL: Deno.env.get('DATABASE_URL'),
      DB_URL: Deno.env.get('DB_URL'),
      SUPABASE_DB_URL: Deno.env.get('SUPABASE_DB_URL'),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'set' : 'missing',
      SERVICE_ROLE_KEY: Deno.env.get('SERVICE_ROLE_KEY') ? 'set' : 'missing',
    });
    const body = await c.req.json();
    const input = RegisterRequestSchema.parse(body);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('User')
      .select('id')
      .eq('email', input.email)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('register: failed to check existing user', existingError);
      throw new HttpError('登録手続きを完了できませんでした。時間をおいて再度お試しください。', {
        status: HTTP_STATUS.INTERNAL_ERROR,
        expose: true,
      });
    }

    if (existing) {
      throw new HttpError('登録手続きを完了できませんでした。入力内容をご確認ください。', {
        status: HTTP_STATUS.BAD_REQUEST,
        expose: true,
      });
    }

    const passwordHash = await hashPassword(input.password);
    const nowIso = new Date().toISOString();
    const { data: row, error: insertError } = await supabaseAdmin
      .from('User')
      .insert({ email: input.email, passwordHash, createdAt: nowIso, updatedAt: nowIso })
      .select('id, email, aiCredits')
      .single();

    if (insertError || !row) {
      console.error('register: failed to create user', insertError);
      throw new HttpError('登録手続きを完了できませんでした。入力内容をご確認ください。', {
        status: HTTP_STATUS.INTERNAL_ERROR,
        expose: true,
      });
    }

    const user = serializeUser(row);
    const token = await signUserToken(user);
    persistAuth(c, token);

    const usageStatus = await evaluateAiUsage(user.id);
    const onboarding = await getOnboardingStatus(user.id);

    return c.json(
      {
        message: 'ユーザー登録が完了しました',
        user,
        usage: summarizeUsageStatus(usageStatus),
        onboarding,
      },
      HTTP_STATUS.CREATED,
    );
  } catch (err) {
    console.error('register error', err);
    throw err;
  }
};

const handleLogin = async (c: Hono.Context) => {
  try {
    console.log('login called', c.req.url);
    console.log('env check', {
      DATABASE_URL: Deno.env.get('DATABASE_URL'),
      DB_URL: Deno.env.get('DB_URL'),
      SUPABASE_DB_URL: Deno.env.get('SUPABASE_DB_URL'),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'set' : 'missing',
      SERVICE_ROLE_KEY: Deno.env.get('SERVICE_ROLE_KEY') ? 'set' : 'missing',
    });
    const body = await c.req.json();
    let input: ReturnType<typeof LoginRequestSchema['parse']>;
    try {
      input = LoginRequestSchema.parse(body);
    } catch (err) {
      console.error('login validation error', err);
      throw new HttpError('入力内容が正しくありません', {
        status: HTTP_STATUS.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        expose: true,
        data: (err as any)?.issues,
      });
    }

    const { data: record, error } = await supabaseAdmin
      .from('User')
      .select('id, email, passwordHash, aiCredits')
      .eq('email', input.email)
      .maybeSingle();

    if (error) {
      console.error('login: failed to fetch user', error);
      throw new HttpError('ログインに失敗しました', { status: HTTP_STATUS.INTERNAL_ERROR });
    }

    if (!record || !record.passwordHash) {
      throw new HttpError('メールアドレスまたはパスワードが正しくありません', {
        status: HTTP_STATUS.UNAUTHORIZED,
        expose: true,
      });
    }

    const valid = await verifyPassword(input.password, record.passwordHash);
    if (!valid) {
      throw new HttpError('メールアドレスまたはパスワードが正しくありません', {
        status: HTTP_STATUS.UNAUTHORIZED,
        expose: true,
      });
    }

    const user = serializeUser(record);
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
    console.error('login error', err);
    throw err;
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
    .select('id, email, aiCredits')
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

REGISTER_PATHS.forEach((path) => app.post(path, (c) => handleRegister(c)));
LOGIN_PATHS.forEach((path) => app.post(path, (c) => handleLogin(c)));
LOGOUT_PATHS.forEach((path) => app.post(path, (c) => handleLogout(c)));
SESSION_PATHS.forEach((path) => app.get(path, (c) => handleSession(c)));

// Fallback to handle OPTIONS preflight without hitting error handler
app.options('*', (c) => c.text('ok'));

export default app;

interface DbUser {
  id: number;
  email: string;
  aiCredits: number | null;
  passwordHash?: string | null;
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
  };
}

async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string | null | undefined) {
  if (!hash) return false;
  // Accept bcrypt hashes ($2a/$2b/$2y). Legacy argon2 hashes are not supported in Edge runtime.
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    return bcrypt.compare(password, hash);
  }
  console.warn('Unsupported password hash format; user must reset password');
  return false;
}
