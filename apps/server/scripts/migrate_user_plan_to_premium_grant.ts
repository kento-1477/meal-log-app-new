/**
 * User.plan から PremiumGrant へのデータ移行スクリプト
 * 
 * 実行手順:
 * 1. バックアップを取得
 * 2. ステージング環境でテスト実行
 * 3. 本番環境で実行: npx tsx prisma/migrations/manual/migrate_user_plan_to_premium_grant.ts
 */

import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

interface MigrationStats {
  totalUsers: number;
  standardUsers: number;
  migrated: number;
  skipped: number;
  errors: number;
}

async function migrateUserPlanToPremiumGrant(): Promise<MigrationStats> {
  console.log('='.repeat(60));
  console.log('User.plan → PremiumGrant マイグレーション開始');
  console.log('='.repeat(60));
  console.log();

  const stats: MigrationStats = {
    totalUsers: 0,
    standardUsers: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  // 全ユーザー数を取得
  stats.totalUsers = await prisma.user.count();
  console.log(`📊 全ユーザー数: ${stats.totalUsers}`);

  // STANDARD ユーザーを取得（plan フィールドがまだ存在する場合）
  let standardUsers;
  try {
    standardUsers = await prisma.$queryRaw<Array<{
      id: number;
      email: string;
      plan: string;
      createdAt: Date;
    }>>`
      SELECT id, email, plan, "createdAt"
      FROM "User"
      WHERE plan = 'STANDARD'
      ORDER BY id
    `;
  } catch (error: any) {
    if (error.message?.includes('column "plan" does not exist')) {
      console.log('✅ User.plan カラムが既に削除されています');
      console.log('✅ マイグレーションは既に完了しているようです');
      return stats;
    }
    throw error;
  }

  stats.standardUsers = standardUsers.length;
  console.log(`📊 STANDARD ユーザー数: ${stats.standardUsers}`);
  console.log();

  if (stats.standardUsers === 0) {
    console.log('✅ 移行対象のユーザーはいません');
    return stats;
  }

  console.log('🔄 ユーザーごとの移行を開始...');
  console.log();

  for (const user of standardUsers) {
    try {
      // 既に PremiumGrant が存在するかチェック
      const existingGrant = await prisma.premiumGrant.findFirst({
        where: { 
          userId: user.id, 
          source: 'PURCHASE' 
        },
      });

      if (existingGrant) {
        console.log(`⏭️  User ${user.id} (${user.email}): 既に PremiumGrant が存在します - スキップ`);
        stats.skipped++;
        continue;
      }

      // IapReceipt から購入日を取得
      const iapReceipts = await prisma.iapReceipt.findMany({
        where: { userId: user.id },
        orderBy: { purchasedAt: 'asc' },
        take: 1,
      });

      // startDate: IapReceiptがあればその購入日、なければUser作成日
      const startDate = iapReceipts[0]?.purchasedAt ?? user.createdAt;
      const endDate = DateTime.fromJSDate(startDate).plus({ days: 365 }).toJSDate();

      // PremiumGrant 作成
      await prisma.premiumGrant.create({
        data: {
          userId: user.id,
          source: 'PURCHASE',
          days: 365,
          startDate,
          endDate,
          iapReceiptId: iapReceipts[0]?.id,
        },
      });

      console.log(`✅ User ${user.id} (${user.email}): PremiumGrant 作成完了`);
      console.log(`   - startDate: ${startDate.toISOString()}`);
      console.log(`   - endDate: ${endDate.toISOString()}`);
      if (iapReceipts[0]) {
        console.log(`   - IapReceipt ID: ${iapReceipts[0].id}`);
      }
      console.log();

      stats.migrated++;
    } catch (error) {
      console.error(`❌ User ${user.id} (${user.email}): エラー発生`);
      console.error(error);
      console.log();
      stats.errors++;
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('マイグレーション完了');
  console.log('='.repeat(60));
  console.log(`📊 統計:`);
  console.log(`   - 全ユーザー数: ${stats.totalUsers}`);
  console.log(`   - STANDARD ユーザー数: ${stats.standardUsers}`);
  console.log(`   - 移行成功: ${stats.migrated}`);
  console.log(`   - スキップ: ${stats.skipped}`);
  console.log(`   - エラー: ${stats.errors}`);
  console.log();

  if (stats.errors > 0) {
    console.warn('⚠️  エラーが発生したユーザーがいます。ログを確認してください。');
    process.exit(1);
  }

  return stats;
}

async function verifyMigration(): Promise<void> {
  console.log('='.repeat(60));
  console.log('マイグレーション検証');
  console.log('='.repeat(60));
  console.log();

  // PremiumGrant の統計
  const totalGrants = await prisma.premiumGrant.count();
  const purchaseGrants = await prisma.premiumGrant.count({
    where: { source: 'PURCHASE' },
  });

  console.log(`📊 PremiumGrant 統計:`);
  console.log(`   - 全 PremiumGrant 数: ${totalGrants}`);
  console.log(`   - PURCHASE ソース: ${purchaseGrants}`);
  console.log();

  // サンプルデータを表示
  const sampleGrants = await prisma.premiumGrant.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { id: true, email: true },
      },
    },
  });

  console.log('📝 最新の PremiumGrant サンプル (最大5件):');
  for (const grant of sampleGrants) {
    console.log(`   - User ${grant.user.id} (${grant.user.email})`);
    console.log(`     Source: ${grant.source}, Days: ${grant.days}`);
    console.log(`     Period: ${grant.startDate.toISOString()} → ${grant.endDate.toISOString()}`);
    console.log();
  }
}

async function main() {
  try {
    const stats = await migrateUserPlanToPremiumGrant();
    
    if (stats.migrated > 0 || stats.skipped > 0) {
      await verifyMigration();
    }

    console.log('✅ すべての処理が正常に完了しました');
  } catch (error) {
    console.error('❌ マイグレーションに失敗しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
