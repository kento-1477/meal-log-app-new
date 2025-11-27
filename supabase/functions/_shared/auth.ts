import { getCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import { getEnv } from './env.ts';
import { HTTP_STATUS, HttpError, setJsonCookie } from './http.ts';

export const AUTH_COOKIE_NAME = 'ml_session';
const encoder = new TextEncoder();

const jwtSecret = () => encoder.encode(getEnv('EDGE_JWT_SECRET', { optional: true }) || getEnv('JWT_SECRET'));

export interface JwtUser {
  id: number;
  email: string;
  aiCredits: number;
}

export interface AuthSession {
  user: JwtUser;
  token: string;
}

export async function signUserToken(user: JwtUser, options: { expiresIn?: string } = {}): Promise<string> {
  const secret = jwtSecret();
  const jwt = await new SignJWT({
    sub: String(user.id),
    email: user.email,
    aiCredits: user.aiCredits,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '7d')
    .sign(secret);
  return jwt;
}

export async function verifyUserToken(token: string): Promise<JwtUser> {
  const secret = jwtSecret();
  const { payload } = await jwtVerify(token, secret);
  const id = payload.sub ? Number(payload.sub) : undefined;
  if (!id || !payload.email) {
    throw new HttpError('Unauthorized', { status: HTTP_STATUS.UNAUTHORIZED });
  }
  return {
    id,
    email: String(payload.email),
    aiCredits: Number(payload.aiCredits ?? 0),
  };
}

export function readAuthToken(c: Context) {
  const header = c.req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7);
  }
  const cookie = getCookie(c, AUTH_COOKIE_NAME);
  if (cookie) return cookie;
  return null;
}

export async function getAuthSession(c: Context): Promise<AuthSession | null> {
  const token = readAuthToken(c);
  if (!token) return null;
  try {
    const user = await verifyUserToken(token);
    return { user, token };
  } catch (_error) {
    return null;
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await getAuthSession(c);
  if (!session) {
    return c.json({ error: '認証が必要です' }, HTTP_STATUS.UNAUTHORIZED);
  }
  c.set('user', session.user);
  await next();
};

export function persistAuth(c: Context, token: string) {
  setJsonCookie(c, AUTH_COOKIE_NAME, token, { maxAge: 60 * 60 * 24 * 7 });
}

export function clearAuth(c: Context) {
  setJsonCookie(c, AUTH_COOKIE_NAME, '', { maxAge: 0 });
}
