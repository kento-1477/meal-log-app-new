import { createServer } from 'http';
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { scheduleDailyLogCleanup } from './jobs/log-cleanup.js';
import { scheduleReferralCompletionCheck } from './jobs/check-referral-completion.js';

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Meal Log App server listening');
});

if (process.env.DISABLE_LOG_CLEANUP !== 'true' && env.NODE_ENV !== 'test') {
  scheduleDailyLogCleanup();
}

if (process.env.DISABLE_REFERRAL_CHECK !== 'true' && env.NODE_ENV !== 'test') {
  scheduleReferralCompletionCheck();
}
