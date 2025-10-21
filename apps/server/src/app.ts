import express from 'express';
import cors from 'cors';
import session from 'express-session';
import pinoHttp from 'pino-http';
import { env } from './env.js';
import { logger } from './logger.js';
import { authRouter } from './routes/auth.js';
import { logRouter } from './routes/log.js';
import { logsRouter } from './routes/logs.js';
import { debugRouter } from './routes/debug.js';
import { foodsRouter } from './routes/foods.js';
import { dashboardRouter } from './routes/dashboard.js';
import { streakRouter } from './routes/streak.js';
import { favoritesRouter } from './routes/favorites.js';
import { profileRouter } from './routes/profile.js';
import { accountRouter } from './routes/account.js';
import { errorHandler } from './middleware/error-handler.js';
import { iapRouter } from './routes/iap.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    cors({
      origin: (origin, callback) => callback(null, origin ?? true),
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
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
  app.use('/', logRouter);
  app.use('/api', logsRouter);
  app.use('/api', foodsRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', streakRouter);
  app.use('/api', favoritesRouter);
  app.use('/api', profileRouter);
  app.use('/api', accountRouter);
  app.use('/api', iapRouter);
  app.use('/debug', debugRouter);

  app.use(errorHandler);

  return app;
}
