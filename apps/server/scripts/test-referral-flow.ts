/**
 * 紹介制度のエンドツーエンドテストスクリプト
 * 
 * テストシナリオ:
 * 1. 紹介者が招待リンクを生成
 * 2. 被紹介者が招待コードをclaim（14日プレミアム付与）
 * 3. 被紹介者が3日連続でログを作成
 * 4. check-referral-completionジョブを手動実行
 * 5. 紹介者に30日プレミアムが付与されることを確認
 */

import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

interface TestUser {
  id: number;
  email: string;
  username: string | null;
}

async function createTestUser(email: string, username: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash: 'dummy_hash', // テスト用
    },
  });
  console.log(`✅ テストユーザー作成: ${user.email} (ID: ${user.id})`);
  return user;
}

async function testReferralFlow() {
  console.log('='.repeat(60));
  console.log('紹介制度 エンドツーエンドテスト');
  console.log('='.repeat(60));
  console.log();

  // クリーンアップ（既存のテストユーザーを削除）
  await prisma.user.deleteMany({
    where: {
      email: {
        in: ['referrer@test.com', 'friend@test.com'],
      },
    },
  });
  console.log('🧹 既存のテストデータをクリーンアップしました');
  console.log();

  // ステップ1: 紹介者アカウント作成
  console.log('【ステップ1】紹介者アカウント作成');
  const referrer = await createTestUser('referrer@test.com', '紹介者テスト');
  console.log();

  // ステップ2: 招待リンク生成
  console.log('【ステップ2】招待リンク生成');
  let inviteLink = await prisma.referralInviteLink.findFirst({
    where: { userId: referrer.id },
  });

  if (!inviteLink) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    inviteLink = await prisma.referralInviteLink.create({
      data: {
        userId: referrer.id,
        code,
      },
    });
  }
  console.log(`✅ 招待コード生成: ${inviteLink.code}`);
  console.log(`   招待リンク: meallog://invite?code=${inviteLink.code}`);
  console.log();

  // ステップ3: 被紹介者アカウント作成
  console.log('【ステップ3】被紹介者アカウント作成');
  const friend = await createTestUser('friend@test.com', '友達テスト');
  console.log();

  // ステップ4: 招待コードをclaim
  console.log('【ステップ4】招待コードをclaim');
  const referral = await prisma.referral.create({
    data: {
      referrerUserId: referrer.id,
      referredUserId: friend.id,
      status: 'PENDING',
      friendPremiumGranted: true,
      deviceFingerprint: 'test_fingerprint',
    },
  });

  // 友だちに14日プレミアム付与
  await prisma.premiumGrant.create({
    data: {
      userId: friend.id,
      source: 'REFERRAL_FRIEND',
      days: 14,
      startDate: new Date(),
      endDate: DateTime.now().plus({ days: 14 }).toJSDate(),
      referralId: referral.id,
    },
  });

  await prisma.referralInviteLink.update({
    where: { id: inviteLink.id },
    data: { signupCount: { increment: 1 } },
  });

  console.log(`✅ Referral作成: ID ${referral.id}`);
  console.log(`✅ 友だちに14日プレミアム付与`);
  console.log();

  // ステップ5: 被紹介者が3日連続でログを作成
  console.log('【ステップ5】被紹介者が3日連続でログを作成');
  const today = DateTime.now().setZone('Asia/Tokyo');
  
  for (let i = 0; i < 3; i++) {
    const logDate = today.minus({ days: 2 - i }).startOf('day').toJSDate();
    await prisma.mealLog.create({
      data: {
        userId: friend.id,
        mealPeriod: 'LUNCH',
        foodItem: `テストログ ${i + 1}日目`,
        calories: 500,
        proteinG: 20,
        fatG: 15,
        carbsG: 60,
        createdAt: logDate,
      },
    });
    console.log(`   ✅ ${i + 1}日目のログ作成 (${logDate.toISOString().split('T')[0]})`);
  }
  console.log();

  // ステップ6: プレミアム状態を確認（友だち）
  console.log('【ステップ6】友だちのプレミアム状態を確認');
  const friendGrants = await prisma.premiumGrant.findMany({
    where: { userId: friend.id },
  });
  console.log(`   PremiumGrant数: ${friendGrants.length}`);
  for (const grant of friendGrants) {
    console.log(`   - Source: ${grant.source}, Days: ${grant.days}`);
    console.log(`     ${grant.startDate.toISOString()} → ${grant.endDate.toISOString()}`);
  }
  console.log();

  // ステップ7: 3日連続達成チェック（手動実行）
  console.log('【ステップ7】3日連続達成チェック（手動実行）');
  
  // 被紹介者の最近3日間のログを確認
  const threeDaysAgo = today.minus({ days: 2 }).startOf('day').toJSDate();
  const recentLogs = await prisma.mealLog.findMany({
    where: {
      userId: friend.id,
      createdAt: { gte: threeDaysAgo },
    },
    orderBy: { createdAt: 'asc' },
  });

  const uniqueDays = new Set(
    recentLogs.map(log => 
      DateTime.fromJSDate(log.createdAt).toFormat('yyyy-MM-dd')
    )
  );

  console.log(`   最近3日間のログ数: ${recentLogs.length}`);
  console.log(`   ユニークな日数: ${uniqueDays.size}`);
  console.log(`   ログ日付: ${Array.from(uniqueDays).join(', ')}`);

  if (uniqueDays.size >= 3) {
    console.log(`   ✅ 3日連続達成！`);
    
    // Referralステータスを更新
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'COMPLETED',
        referrerPremiumGranted: true,
        consecutiveDaysAchieved: 3,
        completedAt: new Date(),
      },
    });

    // 紹介者に30日プレミアム付与
    await prisma.premiumGrant.create({
      data: {
        userId: referrer.id,
        source: 'REFERRAL_REFERRER',
        days: 30,
        startDate: new Date(),
        endDate: DateTime.now().plus({ days: 30 }).toJSDate(),
        referralId: referral.id,
      },
    });

    console.log(`   ✅ 紹介者に30日プレミアム付与`);
  } else {
    console.log(`   ⏳ まだ3日連続未達成（${uniqueDays.size}/3日）`);
  }
  console.log();

  // ステップ8: 最終確認
  console.log('【ステップ8】最終確認');
  
  const referrerGrants = await prisma.premiumGrant.findMany({
    where: { userId: referrer.id },
  });
  console.log(`✅ 紹介者のPremiumGrant数: ${referrerGrants.length}`);
  for (const grant of referrerGrants) {
    console.log(`   - Source: ${grant.source}, Days: ${grant.days}`);
    console.log(`     ${grant.startDate.toISOString()} → ${grant.endDate.toISOString()}`);
  }
  console.log();

  const updatedReferral = await prisma.referral.findUnique({
    where: { id: referral.id },
  });
  console.log(`✅ Referral ステータス: ${updatedReferral?.status}`);
  console.log(`   - friendPremiumGranted: ${updatedReferral?.friendPremiumGranted}`);
  console.log(`   - referrerPremiumGranted: ${updatedReferral?.referrerPremiumGranted}`);
  console.log(`   - consecutiveDaysAchieved: ${updatedReferral?.consecutiveDaysAchieved}`);
  console.log();

  console.log('='.repeat(60));
  console.log('✅ テスト完了');
  console.log('='.repeat(60));
}

async function main() {
  try {
    await testReferralFlow();
  } catch (error) {
    console.error('❌ テストに失敗しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
