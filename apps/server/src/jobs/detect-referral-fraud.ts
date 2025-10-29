/**
 * Referral Fraud Detection Job
 *
 * 簡易な不正検知を定期実行して Referral を FRAUD に更新
 *
 * 検知内容（初期版）:
 * 1) 同一デバイス指紋(deviceFingerprint)で24時間以内に複数アカウント登録
 *    - しきい値: 3件以上でFRAUD判定（PENDINGのみ）
 * 2) プレミアム終了直前（3日以内）に大量紹介(48時間で10件以上) → 警告ログのみ
 *
 * 実行頻度: 1日1回（午前4時 JST）
 */

import { DateTime } from 'luxon';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { ReferralStatus } from '@prisma/client';

const TIMEZONE = 'Asia/Tokyo';
const CHECK_HOUR = 4;

const SAME_FINGERPRINT_WINDOW_HOURS = 24;
const SAME_FINGERPRINT_THRESHOLD = 3;

const PREM_EXPIRY_LOOKAHEAD_DAYS = 3;
const REFERRAL_BURST_WINDOW_HOURS = 48;
const REFERRAL_BURST_THRESHOLD = 10;

export interface FraudDetectionResult {
  flaggedByDeviceFingerprint: number;
  burstWarnings: number;
}

export async function detectReferralFraud(_referenceDate: Date = new Date()): Promise<FraudDetectionResult> {
  const result: FraudDetectionResult = {
    flaggedByDeviceFingerprint: 0,
    burstWarnings: 0,
  };

  // 1) 同一デバイス指紋での複数登録検知
  const now = DateTime.now().setZone(TIMEZONE);
  const fingerprintCutoff = now.minus({ hours: SAME_FINGERPRINT_WINDOW_HOURS }).toJSDate();

  // Prisma groupBy は DB 負荷に優しいが、簡易のため findMany → 集計
  const recentWithFingerprint = await prisma.referral.findMany({
    where: {
      deviceFingerprint: { not: null },
      createdAt: { gte: fingerprintCutoff },
    },
    select: { id: true, deviceFingerprint: true, status: true },
  });

  const byFingerprint = new Map<string, number[]>();
  for (const r of recentWithFingerprint) {
    const key = r.deviceFingerprint as string;
    const list = byFingerprint.get(key) ?? [];
    list.push(r.id);
    byFingerprint.set(key, list);
  }

  for (const [fingerprint, ids] of byFingerprint.entries()) {
    if (ids.length >= SAME_FINGERPRINT_THRESHOLD) {
      const updated = await prisma.referral.updateMany({
        where: {
          id: { in: ids },
          status: ReferralStatus.PENDING,
        },
        data: { status: ReferralStatus.FRAUD },
      });
      if (updated.count > 0) {
        result.flaggedByDeviceFingerprint += updated.count;
        logger.warn({ fingerprint, count: ids.length }, 'flagged referrals as FRAUD due to repeated device fingerprint');
      }
    }
  }

  // 2) プレミアム終了直前の紹介バースト（警告ログのみ）
  const burstWindowStart = now.minus({ hours: REFERRAL_BURST_WINDOW_HOURS }).toJSDate();
  const expiryLookaheadTo = now.plus({ days: PREM_EXPIRY_LOOKAHEAD_DAYS }).toJSDate();

  const referrers = await prisma.referral.findMany({
    where: { createdAt: { gte: burstWindowStart } },
    select: { referrerUserId: true },
    distinct: ['referrerUserId'],
  });

  for (const { referrerUserId } of referrers) {
    const activeGrantEndingSoon = await prisma.premiumGrant.findFirst({
      where: {
        userId: referrerUserId,
        endDate: { lte: expiryLookaheadTo, gte: now.toJSDate() },
      },
      orderBy: { endDate: 'asc' },
    });

    if (!activeGrantEndingSoon) continue;

    const recentCount = await prisma.referral.count({
      where: {
        referrerUserId,
        createdAt: { gte: burstWindowStart },
      },
    });

    if (recentCount >= REFERRAL_BURST_THRESHOLD) {
      result.burstWarnings++;
      logger.warn(
        { referrerUserId, recentCount, grantEndsAt: activeGrantEndingSoon.endDate.toISOString() },
        'suspicious referral burst detected near premium expiry',
      );
    }
  }

  logger.info(result, 'referral fraud detection completed');
  return result;
}

export function scheduleReferralFraudDetection() {
  const scheduleNext = () => {
    const now = DateTime.now().setZone(TIMEZONE);
    let next = now.set({ hour: CHECK_HOUR, minute: 0, second: 0, millisecond: 0 });
    if (next <= now) {
      next = next.plus({ days: 1 });
    }
    const delay = Math.max(next.toMillis() - now.toMillis(), 1000);

    logger.info({ nextRun: next.toISO(), delayMs: delay }, 'scheduled next referral fraud detection');

    const timer = setTimeout(async () => {
      try {
        await detectReferralFraud();
      } catch (error) {
        logger.error({ err: error }, 'referral fraud detection job failed');
      } finally {
        scheduleNext();
      }
    }, delay);

    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
  };

  scheduleNext();
}
