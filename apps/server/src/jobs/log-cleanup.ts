import { DateTime } from 'luxon';
import { UserPlan } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

const FREE_RETENTION_DAYS = 30;
const DELETION_GRACE_DAYS = 30;
const CLEANUP_TIMEZONE = 'Asia/Tokyo';
const CLEANUP_HOUR = 3;

export async function purgeExpiredMealLogs(referenceDate: Date = new Date()) {
  const now = DateTime.fromJSDate(referenceDate).setZone(CLEANUP_TIMEZONE);
  const cutoff = now.minus({ days: FREE_RETENTION_DAYS }).toJSDate();
  const deletionCutoff = now.minus({ days: DELETION_GRACE_DAYS }).toJSDate();

  const [softDeleted, freeExpired] = await Promise.all([
    prisma.mealLog.deleteMany({
      where: {
        deletedAt: {
          not: null,
          lt: deletionCutoff,
        },
      },
    }),
    prisma.mealLog.deleteMany({
      where: {
        deletedAt: null,
        createdAt: { lt: cutoff },
        user: { plan: UserPlan.FREE },
      },
    }),
  ]);

  return {
    softDeleted: softDeleted.count,
    freeExpired: freeExpired.count,
  };
}

export function scheduleDailyLogCleanup() {
  const scheduleNext = () => {
    const now = DateTime.now().setZone(CLEANUP_TIMEZONE);
    let next = now.set({ hour: CLEANUP_HOUR, minute: 0, second: 0, millisecond: 0 });
    if (next <= now) {
      next = next.plus({ days: 1 });
    }
    const delay = Math.max(next.toMillis() - now.toMillis(), 1000);

    const timer = setTimeout(async () => {
      try {
        const result = await purgeExpiredMealLogs();
        logger.info({ ...result }, 'meal log cleanup completed');
      } catch (error) {
        logger.error({ err: error }, 'meal log cleanup failed');
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
