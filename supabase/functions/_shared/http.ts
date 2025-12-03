import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { boolEnv } from './env.ts';

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_IMPLEMENTED: 501,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

export interface HttpErrorOptions {
  status?: number;
  code?: string;
  expose?: boolean;
  data?: unknown;
}

export class HttpError extends Error {
  status: number;
  code?: string;
  expose?: boolean;
  data?: unknown;

  constructor(message: string, options: HttpErrorOptions = {}) {
    super(message);
    this.status = options.status ?? HTTP_STATUS.INTERNAL_ERROR;
    this.code = options.code;
    this.expose = options.expose;
    this.data = options.data;
  }
}

export function createApp() {
  const allowOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  const allowCredentials = boolEnv('ALLOW_CREDENTIALS', true);
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return allowOrigins[0] ?? '*';
        if (allowOrigins.length === 0) return origin;
        return allowOrigins.includes(origin) ? origin : allowOrigins[0] ?? origin;
      },
      allowHeaders: ['Content-Type', 'Authorization', 'X-Timezone', 'X-Device-Id', 'Accept-Language'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: allowCredentials,
    }),
  );

  app.use('*', async (c, next) => {
    try {
      await next();
    } catch (error) {
      console.error('Edge function error', error);
      return handleError(c, error);
    }
  });

  return app;
}

export function handleError(c: Context, error: unknown) {
  if (error instanceof HttpError) {
    return c.json(
      {
        error: error.expose === false ? 'Internal Server Error' : error.message,
        code: error.code,
        data: error.data,
      },
      error.status as ContentfulStatusCode,
    );
  }

  const isZodError =
    error instanceof ZodError ||
    (error && typeof error === 'object' && (error as any).name === 'ZodError');

  if (isZodError) {
    const zod = error as ZodError;
    return c.json(
      {
        error: '入力内容が正しくありません',
        code: 'VALIDATION_ERROR',
        details: zod.errors ?? (zod as any).issues,
      },
      HTTP_STATUS.BAD_REQUEST as ContentfulStatusCode,
    );
  }

  return c.json(
    {
      error: 'Internal Server Error',
    },
    HTTP_STATUS.INTERNAL_ERROR as ContentfulStatusCode,
  );
}

export function setJsonCookie(c: Context, name: string, value: string, options: CookieOptions = {}) {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    ...options,
  });
}
