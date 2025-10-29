/**
 * ReferralService
 * 
 * 紹介制度のビジネスロジック
 * 
 * 主な機能:
 * - 招待リンクの生成
 * - 招待コードの検証・紐付け
 * - 3日連続ログの判定
 * - 紹介状況の取得
 */

import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { ReferralStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { StatusCodes } from 'http-status-codes';
import crypto from 'crypto';

const INVITE_CODE_LENGTH = 6;
const FRIEND_PREMIUM_DAYS = 14;
const REFERRER_PREMIUM_DAYS = 30;
const CONSECUTIVE_DAYS_REQUIRED = 3;
const REFERRAL_EXPIRY_DAYS = 30;

interface InviteLinkResult {
  inviteLink: string;
  webLink: string;
  code: string;
  message: string;
}

interface ClaimReferralResult {
  success: boolean;
  premiumDays: number;
  premiumUntil: string;
  referrerUsername: string | null;
}

interface ReferralStats {
  totalReferred: number;
  completedReferred: number;
  pendingReferred: number;
  totalPremiumDaysEarned: number;
}

interface RecentReferral {
  friendUsername: string;
  status: ReferralStatus;
  consecutiveDays: number;
  createdAt: string;
  completedAt: string | null;
}

/**
 * 招待コードを生成（6文字、A-Za-z0-9）
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  
  return code;
}

/**
 * デバイス指紋を生成（IPアドレス + User-Agent）
 */
export function generateDeviceFingerprint(ip: string, userAgent: string): string {
  const data = `${ip}|${userAgent}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 招待リンクを生成または取得
 */
export async function getOrCreateInviteLink(userId: number): Promise<InviteLinkResult> {
  let inviteLink = await prisma.referralInviteLink.findFirst({
    where: { userId },
  });

  if (!inviteLink) {
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = generateInviteCode();
      const existing = await prisma.referralInviteLink.findUnique({
        where: { code },
      });
      
      if (!existing) break;
      
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error('招待コードの生成に失敗しました。しばらく時間をおいて再試行してください。');
      }
    } while (attempts < maxAttempts);

    inviteLink = await prisma.referralInviteLink.create({
      data: {
        userId,
        code: code!,
      },
    });
  }

  const deepLink = `meallog://invite?code=${inviteLink.code}`;
  const webLink = `https://meal-log.app/invite?code=${inviteLink.code}`;

  return {
    inviteLink: deepLink,
    webLink,
    code: inviteLink.code,
    message: '友だち1人で30日延長',
  };
}

/**
 * 招待コードをクレーム（被紹介者として登録）
 */
export async function claimReferralCode(params: {
  userId: number;
  code: string;
  deviceFingerprint: string;
}): Promise<ClaimReferralResult> {
  const inviteLink = await prisma.referralInviteLink.findUnique({
    where: { code: params.code },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  if (!inviteLink) {
    const error = new Error('招待コードが見つかりません');
    Object.assign(error, { statusCode: StatusCodes.NOT_FOUND, expose: true });
    throw error;
  }

  if (inviteLink.userId === params.userId) {
    const error = new Error('自分自身を紹介することはできません');
    Object.assign(error, { statusCode: StatusCodes.BAD_REQUEST, expose: true });
    throw error;
  }

  const existingReferral = await prisma.referral.findUnique({
    where: { referredUserId: params.userId },
  });

  if (existingReferral) {
    const error = new Error('既に招待コードを使用済みです');
    Object.assign(error, { statusCode: StatusCodes.CONFLICT, expose: true });
    throw error;
  }

  const suspiciousReferrals = await prisma.referral.count({
    where: {
      referrerUserId: inviteLink.userId,
      deviceFingerprint: params.deviceFingerprint,
    },
  });

  if (suspiciousReferrals > 0) {
    const error = new Error('不正な紹介として検出されました');
    Object.assign(error, { statusCode: StatusCodes.FORBIDDEN, expose: true });
    throw error;
  }

  const result = await prisma.$transaction(async (tx) => {
    const referral = await tx.referral.create({
      data: {
        referrerUserId: inviteLink.userId,
        referredUserId: params.userId,
        status: ReferralStatus.PENDING,
        friendPremiumGranted: true,
        deviceFingerprint: params.deviceFingerprint,
      },
    });

    await tx.referralInviteLink.update({
      where: { id: inviteLink.id },
      data: {
        signupCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    const now = new Date();
    const endDate = DateTime.fromJSDate(now).plus({ days: FRIEND_PREMIUM_DAYS }).toJSDate();
    
    await tx.premiumGrant.create({
      data: {
        userId: params.userId,
        source: 'REFERRAL_FRIEND',
        days: FRIEND_PREMIUM_DAYS,
        startDate: now,
        endDate,
        referralId: referral.id,
      },
    });

    // 直近1時間の紹介数を集計（大量紹介の兆候）
    const oneHourAgo = DateTime.now().minus({ hours: 1 }).toJSDate();
    const recentCount = await tx.referral.count({
      where: {
        referrerUserId: inviteLink.userId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentCount >= 10) {
      logger.warn(
        { referrerUserId: inviteLink.userId, recentCount },
        'suspicious high referral volume detected within last hour',
      );
    }

    return {
      referral,
      premiumUntil: endDate,
    };
  });

  return {
    success: true,
    premiumDays: FRIEND_PREMIUM_DAYS,
    premiumUntil: result.premiumUntil.toISOString(),
    referrerUsername: inviteLink.user.username,
  };
}

/**
 * ユーザーの紹介統計を取得
 */
export async function getReferralStats(userId: number): Promise<ReferralStats> {
  const referrals = await prisma.referral.findMany({
    where: { referrerUserId: userId },
  });

  const totalReferred = referrals.length;
  const completedReferred = referrals.filter((r) => r.status === ReferralStatus.COMPLETED).length;
  const pendingReferred = referrals.filter((r) => r.status === ReferralStatus.PENDING).length;

  const premiumGrants = await prisma.premiumGrant.findMany({
    where: {
      userId,
      source: 'REFERRAL_REFERRER',
    },
  });

  const totalPremiumDaysEarned = premiumGrants.reduce((sum, grant) => sum + grant.days, 0);

  return {
    totalReferred,
    completedReferred,
    pendingReferred,
    totalPremiumDaysEarned,
  };
}

/**
 * ユーザーの最近の紹介を取得
 */
export async function getRecentReferrals(userId: number, limit: number = 5): Promise<RecentReferral[]> {
  const referrals = await prisma.referral.findMany({
    where: { referrerUserId: userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      referredUser: {
        select: {
          username: true,
        },
      },
    },
  });

  return referrals.map((r) => ({
    friendUsername: r.referredUser.username ?? `User_${r.referredUserId}`,
    status: r.status,
    consecutiveDays: r.consecutiveDaysAchieved,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
}

/**
 * 3日連続ログインを確認し、達成していれば紹介者にプレミアムを付与
 */
export async function checkAndCompleteReferral(referralId: number): Promise<boolean> {
  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: {
      referredUser: {
        include: {
          mealLogs: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      },
    },
  });

  if (!referral) {
    return false;
  }

  if (referral.status !== ReferralStatus.PENDING) {
    return false;
  }

  const hasConsecutiveDays = checkConsecutiveDays(
    referral.referredUser.mealLogs.map((log) => log.createdAt),
    CONSECUTIVE_DAYS_REQUIRED
  );

  if (!hasConsecutiveDays) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
    await tx.referral.update({
      where: { id: referralId },
      data: {
        status: ReferralStatus.COMPLETED,
        referrerPremiumGranted: true,
        consecutiveDaysAchieved: CONSECUTIVE_DAYS_REQUIRED,
        completedAt: new Date(),
      },
    });

    const now = new Date();
    const endDate = DateTime.fromJSDate(now).plus({ days: REFERRER_PREMIUM_DAYS }).toJSDate();

    await tx.premiumGrant.create({
      data: {
        userId: referral.referrerUserId,
        source: 'REFERRAL_REFERRER',
        days: REFERRER_PREMIUM_DAYS,
        startDate: now,
        endDate,
        referralId: referral.id,
      },
    });
  });

  return true;
}

/**
 * 連続日数をチェック
 */
function checkConsecutiveDays(dates: Date[], requiredDays: number): boolean {
  if (dates.length < requiredDays) {
    return false;
  }

  const uniqueDays = new Set<string>();
  
  for (const date of dates) {
    const dayStr = DateTime.fromJSDate(date).setZone('Asia/Tokyo').startOf('day').toISODate();
    if (dayStr) {
      uniqueDays.add(dayStr);
    }
  }

  if (uniqueDays.size < requiredDays) {
    return false;
  }

  const sortedDays = Array.from(uniqueDays).sort();
  
  let consecutiveCount = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prevDay = DateTime.fromISO(sortedDays[i - 1]);
    const currDay = DateTime.fromISO(sortedDays[i]);
    
    const diffDays = currDay.diff(prevDay, 'days').days;
    
    if (diffDays === 1) {
      consecutiveCount++;
      if (consecutiveCount >= requiredDays) {
        return true;
      }
    } else {
      consecutiveCount = 1;
    }
  }

  return false;
}

/**
 * 期限切れの紹介をEXPIREDにする
 */
export async function expireOldReferrals(): Promise<number> {
  const cutoffDate = DateTime.now().minus({ days: REFERRAL_EXPIRY_DAYS }).toJSDate();

  const result = await prisma.referral.updateMany({
    where: {
      status: ReferralStatus.PENDING,
      createdAt: { lt: cutoffDate },
    },
    data: {
      status: ReferralStatus.EXPIRED,
    },
  });

  return result.count;
}
