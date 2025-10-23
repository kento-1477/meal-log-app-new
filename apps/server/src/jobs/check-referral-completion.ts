/**
 * Referral Completion Check Job
 * 
 * 紹介プログラムの達成チェックジョブ
 * - 3日連続ログを達成したユーザーがいるか確認
 * - 達成していれば紹介者にプレミアムを付与
 * - 30日経過した未達成紹介をEXPIREDに更新
 * 
 * 実行頻度: 1日1回（午前3時 JST）
 */

import { DateTime } from 'luxon';
import { ReferralStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { checkAndCompleteReferral, expireOldReferrals } from '../services/referral-service.js';

const TIMEZONE = 'Asia/Tokyo';
const CHECK_HOUR = 3;

export interface ReferralCheckResult {
  pendingChecked: number;
  completed: number;
  expired: number;
}

/**
 * PENDING状態の紹介をチェックし、3日連続達成を確認
 */
export async function checkPendingReferrals(_referenceDate: Date = new Date()): Promise<ReferralCheckResult> {
  logger.info('Starting referral completion check...');

  const result: ReferralCheckResult = {
    pendingChecked: 0,
    completed: 0,
    expired: 0,
  };

  const pendingReferrals = await prisma.referral.findMany({
    where: {
      status: ReferralStatus.PENDING,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  result.pendingChecked = pendingReferrals.length;
  logger.info({ count: result.pendingChecked }, 'Found pending referrals');

  for (const referral of pendingReferrals) {
    try {
      const completed = await checkAndCompleteReferral(referral.id);
      if (completed) {
        result.completed++;
        logger.info(
          {
            referralId: referral.id,
            referrerId: referral.referrerUserId,
            referredId: referral.referredUserId,
          },
          'Referral completed: 3 consecutive days achieved',
        );
      }
    } catch (error) {
      logger.error(
        {
          err: error,
          referralId: referral.id,
        },
        'Failed to check referral completion',
      );
    }
  }

  const expiredCount = await expireOldReferrals();
  result.expired = expiredCount;

  if (expiredCount > 0) {
    logger.info({ count: expiredCount }, 'Expired old pending referrals');
  }

  logger.info(result, 'Referral completion check completed');

  return result;
}

/**
 * ジョブのスケジューリング
 */
export function scheduleReferralCompletionCheck() {
  const scheduleNext = () => {
    const now = DateTime.now().setZone(TIMEZONE);
    let next = now.set({ hour: CHECK_HOUR, minute: 0, second: 0, millisecond: 0 });
    
    if (next <= now) {
      next = next.plus({ days: 1 });
    }
    
    const delay = Math.max(next.toMillis() - now.toMillis(), 1000);

    logger.info(
      {
        nextRun: next.toISO(),
        delayMs: delay,
      },
      'Scheduled next referral completion check',
    );

    const timer = setTimeout(async () => {
      try {
        const result = await checkPendingReferrals();
        logger.info(result, 'Referral completion check job completed');
      } catch (error) {
        logger.error({ err: error }, 'Referral completion check job failed');
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
