import express from 'express';
import cors from 'cors';
import session from 'express-session';
import pinoHttpModule from 'pino-http';
import { env } from './env.js';
import { logger } from './logger.js';
import { authRouter } from './routes/auth.js';
import { logRouter } from './routes/log.js';
import { logsRouter } from './routes/logs.js';
import { foodsRouter } from './routes/foods.js';
import { dashboardRouter } from './routes/dashboard.js';
import { streakRouter } from './routes/streak.js';
import { favoritesRouter } from './routes/favorites.js';
import { profileRouter } from './routes/profile.js';
import { accountRouter } from './routes/account.js';
import { errorHandler } from './middleware/error-handler.js';
import { iapRouter } from './routes/iap.js';
import referralRouter from './routes/referral.js';
import { notificationsRouter } from './routes/notifications.js';
import { onboardingRouter } from './routes/onboarding.js';
import { prisma } from './db/prisma.js';
import { PrismaSessionStore } from './db/prisma-session-store.js';
import { debugRouter } from './routes/debug.js';

export function createApp() {
  const app = express();

  console.log('[app] NODE_ENV:', env.NODE_ENV);

  app.set('trust proxy', resolveTrustProxy(env.TRUST_PROXY ?? process.env.TRUST_PROXY_HOPS));

  app.disable('x-powered-by');

  app.use(
    cors({
      origin: (origin, callback) => callback(null, origin ?? true),
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  const sessionStore = new PrismaSessionStore(prisma);

  app.use(
    session({
      store: sessionStore,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 30,
        httpOnly: true,
        sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
        secure: env.NODE_ENV === 'production',
      },
    }),
  );

  const pinoHttp =
    typeof (pinoHttpModule as any).default === 'function'
      ? (pinoHttpModule as any).default
      : (pinoHttpModule as any);

  app.use(
    pinoHttp({
      logger,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        censor: '**REDACTED**',
      },
    }),
  );

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  app.use('/api', authRouter);
  app.use('/api', onboardingRouter);
  app.use('/', logRouter);
  app.use('/api', logsRouter);
  app.use('/api', foodsRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', streakRouter);
  app.use('/api', favoritesRouter);
  app.use('/api', profileRouter);
  app.use('/api/user', accountRouter);
  app.use('/api', iapRouter);
  app.use('/api/referral', referralRouter);
  app.use('/api/notifications', notificationsRouter);
  if (env.NODE_ENV !== 'production') {
    app.use('/debug', debugRouter);
  }

  app.use(errorHandler);

  if (env.NODE_ENV !== 'production') {
    const routes: string[] = [];
    const collect = (stack: any, prefix = '') => {
      if (!Array.isArray(stack)) return;
      for (const layer of stack) {
        if (layer.route) {
          const path = prefix + layer.route.path;
          const methods = Object.keys(layer.route.methods).join(',');
          routes.push(`${methods} ${path}`);
        } else if (layer.name === 'router' && layer.handle?.stack) {
          const routePath = layer.regexp?.fast_slash
            ? ''
            : layer.regexp?.source?.replace('^\\/', '/').replace('\\/?(?=\\/|$)', '') ?? '';
          collect(layer.handle.stack, prefix + routePath);
        }
      }
    };
    collect((app as any)._router.stack);
    console.log('[app] registered routes:', routes);
  }

  return app;
}

function resolveTrustProxy(value: string | number | undefined) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  return normalized;
}
