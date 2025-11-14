import { DateTime } from 'luxon';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

const CLEANUP_TIMEZONE = 'Asia/Tokyo';
const CLEANUP_HOUR = 2;

export async function purgeExpiredSessions(reference: Date = new Date()) {
  const now = DateTime.fromJSDate(reference).setZone(CLEANUP_TIMEZONE);
  const deleted = await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: now.toJSDate() },
    },
  });
  return deleted.count;
}

export function scheduleSessionCleanup() {
  const scheduleNext = () => {
    const now = DateTime.now().setZone(CLEANUP_TIMEZONE);
    let next = now.set({ hour: CLEANUP_HOUR, minute: 0, second: 0, millisecond: 0 });
    if (next <= now) {
      next = next.plus({ days: 1 });
    }
    const delay = Math.max(next.toMillis() - now.toMillis(), 1000);

    const timer = setTimeout(async () => {
      try {
        const removed = await purgeExpiredSessions();
        logger.info({ removed }, 'session cleanup completed');
      } catch (error) {
        logger.error({ err: error }, 'session cleanup failed');
      } finally {
        scheduleNext();
      }
    }, delay);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  };

  scheduleNext();
}
