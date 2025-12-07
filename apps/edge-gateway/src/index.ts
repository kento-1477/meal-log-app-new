interface Env {
  TARGET_ORIGIN: string;
  ALLOWED_ORIGINS?: string;
  API_PREFIX?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
}

const DEFAULT_ALLOWED_ORIGIN = '*';
const DEFAULT_API_PREFIX = '/api';
const ALLOWED_METHODS = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Authorization,Content-Type,Accept,Idempotency-Key';
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    let response: Response;
    try {
      const url = new URL(request.url);

      if (url.pathname === '/healthz') {
        response = new Response('ok', { status: 200 });
        return withCors(response, request, env);
      }

      if (request.method === 'OPTIONS') {
        response = buildPreflightResponse(request, env);
        return response;
      }

      const prefix = env.API_PREFIX?.trim() || DEFAULT_API_PREFIX;
      if (!url.pathname.startsWith(prefix)) {
        response = new Response('Not found', { status: 404 });
        return response;
      }

      const rateLimited = applyRateLimit(request, env);
      if (rateLimited) {
        response = rateLimited;
        return withCors(response, request, env);
      }

      const target = buildTargetUrl(url, env.TARGET_ORIGIN, prefix);
      const targetRequest = await buildProxyRequest(request, target);
      const upstreamResponse = await fetch(targetRequest);
      response = new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      });
      return withCors(response, request, env);
    } catch (error) {
      console.error('[gateway] proxy error', error);
      response = new Response(
        JSON.stringify({
          ok: false,
          error: 'gateway_error',
          message: error instanceof Error ? error.message : 'Unknown gateway error',
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        },
      );
      return withCors(response, request, env);
    } finally {
      const duration = Date.now() - started;
      const url = new URL(request.url);
      console.log(`[gateway] ${request.method} ${url.pathname} -> ${response?.status ?? 'err'} (${duration}ms)`);
    }
  },
};

function buildTargetUrl(incoming: URL, targetOrigin: string, prefix: string): URL {
  const base = new URL(targetOrigin);
  const pattern = new RegExp(`^${prefix}`);
  const rewrittenPath = pattern.test(incoming.pathname)
    ? incoming.pathname
    : joinPaths(prefix, incoming.pathname);
  base.pathname = joinPaths(base.pathname, rewrittenPath);
  base.search = incoming.search;
  return base;
}

async function buildProxyRequest(request: Request, target: URL): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete('host');
  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const body = hasBody ? await request.arrayBuffer() : undefined;
  return new Request(target.toString(), {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
  });
}

function buildPreflightResponse(request: Request, env: Env): Response {
  const headers = new Headers();
  applyCorsHeaders(headers, request, env);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status: 204, headers });
}

function applyRateLimit(request: Request, env: Env): Response | null {
  const windowMs = Number(env.RATE_LIMIT_WINDOW_MS ?? '60000');
  const maxRequests = Number(env.RATE_LIMIT_MAX_REQUESTS ?? '60');
  if (!Number.isFinite(windowMs) || !Number.isFinite(maxRequests)) {
    return null;
  }

  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'anonymous';

  const bucket = rateLimits.get(clientIp) ?? { count: 0, resetAt: Date.now() + windowMs };
  if (Date.now() > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = Date.now() + windowMs;
  }
  bucket.count += 1;
  rateLimits.set(clientIp, bucket);

  if (bucket.count > maxRequests) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'rate_limited',
        reset_at: new Date(bucket.resetAt).toISOString(),
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return null;
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  applyCorsHeaders(headers, request, env);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applyCorsHeaders(headers: Headers, request: Request, env: Env) {
  const originHeader = request.headers.get('Origin');
  const allowedOrigin = resolveAllowedOrigin(originHeader, env.ALLOWED_ORIGINS);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  if (allowedOrigin !== '*') {
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Expose-Headers', 'Content-Type,Authorization');
}

function resolveAllowedOrigin(requestOrigin: string | null, envOrigins?: string): string {
  if (!envOrigins || envOrigins.trim() === '') {
    return requestOrigin ?? DEFAULT_ALLOWED_ORIGIN;
  }
  if (envOrigins.trim() === '*') {
    return '*';
  }

  const allowed = envOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowed[0] ?? DEFAULT_ALLOWED_ORIGIN;
}

function joinPaths(basePath: string, incomingPath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const normalizedIncoming = incomingPath.startsWith('/') ? incomingPath : `/${incomingPath}`;
  return `${normalizedBase}${normalizedIncoming}`.replace(/\/{2,}/g, '/');
}
