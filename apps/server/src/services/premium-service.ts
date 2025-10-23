/**
 * PremiumService
 * 
 * プレミアム状態を判定・管理するサービス
 * PremiumGrantテーブルを参照してプレミアム状態を判定
 * 
 * 関連サービス:
 * - ai-usage-service: AI使用制限の判定
 * - log-cleanup: ログ保存期間の判定
 * - iap-service: 課金処理時のプレミアム付与
 */

import { prisma } from '../db/prisma.js';
import { PremiumSource } from '@prisma/client';
import { DateTime } from 'luxon';

export interface PremiumStatus {
  isPremium: boolean;
  source: PremiumSource | null;
  daysRemaining: number;
  expiresAt: Date | null;
}

export interface GrantPremiumDaysParams {
  userId: number;
  source: PremiumSource;
  days: number;
  referralId?: number;
  iapReceiptId?: number;
}

/**
 * ユーザーが現在プレミアム会員かどうかを判定
 * 
 * @param userId - ユーザーID
 * @returns プレミアム会員の場合 true
 */
export async function isPremium(userId: number): Promise<boolean> {
  const now = new Date();
  
  const activeGrant = await prisma.premiumGrant.findFirst({
    where: {
      userId,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: { endDate: 'desc' },
  });

  return activeGrant !== null;
}

/**
 * ユーザーのプレミアム状態の詳細情報を取得
 * 
 * @param userId - ユーザーID
 * @returns プレミアムステータス情報
 */
export async function getPremiumStatus(userId: number): Promise<PremiumStatus> {
  const now = new Date();
  
  const activeGrant = await prisma.premiumGrant.findFirst({
    where: {
      userId,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: { endDate: 'desc' },
  });

  if (!activeGrant) {
    return {
      isPremium: false,
      source: null,
      daysRemaining: 0,
      expiresAt: null,
    };
  }

  const nowDt = DateTime.now();
  const expiresAt = DateTime.fromJSDate(activeGrant.endDate);
  const daysRemaining = Math.ceil(expiresAt.diff(nowDt, 'days').days);

  return {
    isPremium: true,
    source: activeGrant.source,
    daysRemaining: Math.max(daysRemaining, 0),
    expiresAt: activeGrant.endDate,
  };
}

/**
 * ユーザーの全PremiumGrantを取得（履歴含む）
 * 
 * @param userId - ユーザーID
 * @returns PremiumGrantの配列
 */
export async function getAllPremiumGrants(userId: number) {
  return prisma.premiumGrant.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      referral: true,
      iapReceipt: {
        select: {
          id: true,
          platform: true,
          productId: true,
          transactionId: true,
          purchasedAt: true,
        },
      },
    },
  });
}

/**
 * ユーザーにプレミアム期間を付与
 * 
 * 重複付与や期間の延長ロジックは呼び出し側で管理すること
 * このメソッドは単純に新しいPremiumGrantレコードを作成する
 * 
 * @param params - 付与パラメータ
 */
export async function grantPremiumDays(params: GrantPremiumDaysParams): Promise<void> {
  const now = new Date();
  const endDate = DateTime.fromJSDate(now).plus({ days: params.days }).toJSDate();

  await prisma.premiumGrant.create({
    data: {
      userId: params.userId,
      source: params.source,
      days: params.days,
      startDate: now,
      endDate,
      referralId: params.referralId,
      iapReceiptId: params.iapReceiptId,
    },
  });
}

/**
 * ユーザーIDの配列からプレミアムユーザーのIDのみを抽出
 * 
 * 大量のユーザーを処理する場合に使用（例: log-cleanup）
 * 
 * @param userIds - チェック対象のユーザーIDの配列
 * @returns プレミアムユーザーのIDの配列
 */
export async function filterPremiumUserIds(userIds: number[]): Promise<number[]> {
  if (userIds.length === 0) {
    return [];
  }

  const now = new Date();
  
  const premiumGrants = await prisma.premiumGrant.findMany({
    where: {
      userId: { in: userIds },
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  return premiumGrants.map((grant) => grant.userId);
}

/**
 * 現在アクティブな全プレミアムユーザーのIDを取得
 * 
 * @returns プレミアムユーザーのIDの配列
 */
export async function getAllPremiumUserIds(): Promise<number[]> {
  const now = new Date();
  
  const premiumGrants = await prisma.premiumGrant.findMany({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  return premiumGrants.map((grant) => grant.userId);
}
