import { RegisterRequestSchema, LoginRequestSchema } from '@shared/index.js';
import { hash, verify } from 'argon2-browser';
import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { sql } from '../_shared/db.ts';
import { clearAuth, getAuthSession, persistAuth, signUserToken } from '../_shared/auth.ts';
import { evaluateAiUsage, summarizeUsageStatus } from '../_shared/ai.ts';

const app = createApp();

// Helpers to reuse handler for both /route and /api/route
const routes = {
  register: ['/register', '/api/register'] as const,
  login: ['/login', '/api/login'] as const,
  logout: ['/logout', '/api/logout'] as const,
  session: ['/session', '/api/session'] as const,
};

const handleRegister = async (c: Hono.Context) => {
  const body = await c.req.json();
  const input = RegisterRequestSchema.parse(body);

  const existing = await sql`
    select "id" from "User" where "email" = ${input.email} limit 1;
  `;

  if (existing.length > 0) {
    throw new HttpError('登録手続きを完了できませんでした。入力内容をご確認ください。', {
      status: HTTP_STATUS.BAD_REQUEST,
      expose: true,
    });
  }

  const hashed = await hash({ pass: input.password });
  const passwordHash = hashed.encoded;
  const [row] = await sql<DbUser[]>`
    insert into "User" ("email", "passwordHash")
    values (${input.email}, ${passwordHash})
    returning "id", "email", "aiCredits";
  `;

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
};

const handleLogin = async (c: Hono.Context) => {
  const body = await c.req.json();
  const input = LoginRequestSchema.parse(body);

  const rows = await sql<DbUser[]>`
    select "id", "email", "passwordHash", "aiCredits"
    from "User"
    where "email" = ${input.email}
    limit 1;
  `;

  const record = rows[0];
  if (!record) {
    throw new HttpError('メールアドレスまたはパスワードが正しくありません', {
      status: HTTP_STATUS.UNAUTHORIZED,
      expose: true,
    });
  }

  const valid = await verify({ pass: input.password, encoded: record.passwordHash });
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

  const rows = await sql<DbUser[]>`
    select "id", "email", "aiCredits"
    from "User"
    where "id" = ${session.user.id}
    limit 1;
  `;

  const record = rows[0];
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

routes.register.forEach((path) => app.post(path, (c) => handleRegister(c)));
routes.login.forEach((path) => app.post(path, (c) => handleLogin(c)));
routes.logout.forEach((path) => app.post(path, (c) => handleLogout(c)));
routes.session.forEach((path) => app.get(path, (c) => handleSession(c)));

// Fallback to handle OPTIONS preflight without hitting error handler
app.options('*', (c) => c.text('ok'));

export default app;

interface DbUser {
  id: number;
  email: string;
  aiCredits: number;
  passwordHash?: string;
}

async function getOnboardingStatus(userId: number) {
  const rows = await sql<{ questionnaireCompletedAt: Date | null }[]>`
    select "questionnaireCompletedAt"
    from "UserProfile"
    where "userId" = ${userId}
    limit 1;
  `;
  const completedAt = rows[0]?.questionnaireCompletedAt ?? null;
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
