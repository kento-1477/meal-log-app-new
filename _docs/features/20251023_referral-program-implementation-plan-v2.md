# 紹介制度実装計画書 v2（案A: PremiumGrant統一管理版）

**更新日**: 2025-10-23  
**ステータス**: 最終確定、案A採用  
**優先度**: 高  
**推定工数**: 12〜15日（1名想定、マイグレーション含む）

---

## 0. エグゼクティブサマリー

### 目的
有料転換率を最優先で向上させ、持続可能なユーザー獲得を実現する。

### アーキテクチャの重要変更
**User.plan を廃止し、PremiumGrant でプレミアム状態を統一管理**

- 従来: `User.plan (FREE/STANDARD)` でプレミアム管理
- 新規: `PremiumGrant` テーブルで紹介/課金の両方を管理
- **理由**: 紹介プレミアム（14日/30日）と課金プレミアム（1年）を統一的に扱うため

### リワード設計（最終確定版）
- **友だち（被紹介者）**: 登録時に即時**14日間**プレミアム付与
- **紹介者**: 友だちが**3日連続ログ達成**で**30日間**プレミアム付与（人数無制限）
- **表現**: 「友だち1人で30日延長」
- **プレミアム特典**: 
  - 月間カロリー差分表示
  - AI使用制限緩和（1日3回 → 20回）
  - **過去90日の履歴保存**（無料ユーザーは30日のみ）

### KPI
- **主要**: 30日以内の有料化率（紹介経由）
- **次点**: K係数（目標**≥0.5**、成熟期0.8〜1.0）、新規登録数

### スコープ
- **Phase 1**: iOS先行、基本機能実装 + 既存システムの移行（12〜15日）
- **Phase 2**: 不正検知強化、Analytics統合（3日）
- **Phase 3**: Android対応、Universal Links対応（4日）

---

## 1. データベース設計

### 1.1 既存テーブルの変更

#### ✅ チェックリスト: `User` モデル修正

**削除**:
- [x] `User.plan` フィールドを削除
- [x] `UserPlan` enum を削除

**追加**:
- [x] `User.referralsMade` リレーション追加（1対多、Referralへ）
- [x] `User.referredBy` リレーション追加（1対1、Referralへ）
- [x] `User.premiumGrants` リレーション追加（1対多、PremiumGrantへ）
- [x] `User.inviteLinks` リレーション追加（1対多、ReferralInviteLinkへ）

**マイグレーション前の確認**:
- [x] 既存の `User.plan = STANDARD` ユーザー数を確認（課金済みユーザー）
- [x] マイグレーションスクリプトで PremiumGrant に変換する計画を作成

```prisma
model User {
  id             Int              @id @default(autoincrement())
  email          String           @unique
  username       String?
  passwordHash   String
  // plan        UserPlan         @default(FREE)  // ← 削除
  aiCredits      Int              @default(0)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  mealLogs       MealLog[]
  ingestRequests IngestRequest[]
  edits          MealLogEdit[]
  shareTokens    LogShareToken[]
  favoriteMeals  FavoriteMeal[]
  usageCounters  AiUsageCounter[]
  iapReceipts    IapReceipt[]
  profile        UserProfile?
  premiumGrants  PremiumGrant[]   // ← 追加
  referralsMade  Referral[]       @relation("ReferrerRelation")  // ← 追加
  referredBy     Referral?        @relation("ReferredRelation")  // ← 追加
  inviteLinks    ReferralInviteLink[]  // ← 追加
}

// enum UserPlan {  // ← 削除
//   FREE
//   STANDARD
// }
```

### 1.2 新規テーブル作成

#### ✅ チェックリスト: `PremiumGrant` テーブル

```prisma
model PremiumGrant {
  id          Int             @id @default(autoincrement())
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      Int
  source      PremiumSource
  days        Int
  startDate   DateTime
  endDate     DateTime
  referral    Referral?       @relation(fields: [referralId], references: [id])
  referralId  Int?
  iapReceipt  IapReceipt?     @relation(fields: [iapReceiptId], references: [id])
  iapReceiptId Int?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([userId, endDate])
  @@index([source])
}

enum PremiumSource {
  REFERRAL_FRIEND    // 友だちとして招待された（14日）
  REFERRAL_REFERRER  // 紹介者として獲得（30日）
  PURCHASE           // 課金購入（365日）
  ADMIN_GRANT        // 管理者付与
}
```

- [x] Prismaスキーマに `PremiumGrant` モデルを追加
- [x] `PremiumSource` enum を追加
- [x] `User`, `Referral`, `IapReceipt` との関連を設定
- [x] マイグレーションファイル作成
- [ ] マイグレーション実行（dev, staging, prod）

#### ✅ チェックリスト: `Referral` テーブル

```prisma
model Referral {
  id                Int       @id @default(autoincrement())
  referrerUser      User      @relation("ReferrerRelation", fields: [referrerUserId], references: [id], onDelete: Cascade)
  referrerUserId    Int
  referredUser      User      @relation("ReferredRelation", fields: [referredUserId], references: [id], onDelete: Cascade)
  referredUserId    Int       @unique
  status            ReferralStatus  @default(PENDING)
  friendPremiumGranted Boolean @default(false)
  referrerPremiumGranted Boolean @default(false)
  consecutiveDaysAchieved Int   @default(0)
  deviceFingerprint String?
  completedAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  premiumGrants     PremiumGrant[]

  @@index([referrerUserId])
  @@index([status])
  @@index([deviceFingerprint])
}

enum ReferralStatus {
  PENDING      // 友だち登録済み、3日連続未達成
  COMPLETED    // 3日連続達成、紹介者にプレミアム付与済み
  EXPIRED      // 30日経過しても未達成
  FRAUD        // 不正と判定
}
```

- [x] Prismaスキーマに `Referral` モデルを追加
- [x] `ReferralStatus` enum を追加
- [x] `deviceFingerprint` フィールド追加（不正検知用）
- [x] マイグレーションファイル作成
- [ ] マイグレーション実行

#### ✅ チェックリスト: `ReferralInviteLink` テーブル

```prisma
model ReferralInviteLink {
  id          Int       @id @default(autoincrement())
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      Int
  code        String    @unique  // 短縮コード（例: "A3K9Px"）
  clickCount  Int       @default(0)
  signupCount Int       @default(0)
  createdAt   DateTime  @default(now())
  lastUsedAt  DateTime?

  @@index([userId])
  @@index([code])
}
```

- [x] Prismaスキーマに `ReferralInviteLink` モデルを追加
- [x] マイグレーションファイル作成
- [ ] マイグレーション実行

#### ✅ チェックリスト: `IapReceipt` モデル修正

```prisma
model IapReceipt {
  // ... 既存フィールド
  premiumGrants PremiumGrant[]  // ← 追加
}
```

- [x] `IapReceipt` に `premiumGrants` リレーション追加
- [x] マイグレーションファイル作成
- [ ] マイグレーション実行

---

## 2. 既存ユーザーのマイグレーション計画

### 2.1 マイグレーションスクリプト作成

#### ✅ チェックリスト: データ移行

- [x] `apps/server/scripts/migrate_user_plan_to_premium_grant.ts` 作成
- [x] 既存の `User.plan = STANDARD` ユーザーを抽出
- [x] 各ユーザーに `PremiumGrant` レコードを作成
  - source: `PURCHASE`
  - days: 365
  - startDate: 最古の IapReceipt.purchasedAt または User.createdAt
  - endDate: startDate + 365日
- [ ] マイグレーション実行前に本番データのバックアップ
- [ ] ステージング環境でテスト実行
- [ ] 本番環境で実行

#### マイグレーションスクリプト例

```typescript
// apps/server/scripts/migrate_user_plan_to_premium_grant.ts
import { PrismaClient, UserPlan, PremiumSource } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

async function migrateUserPlanToPremiumGrant() {
  console.log('Starting User.plan → PremiumGrant migration...');

  // STANDARD ユーザーを取得
  const standardUsers = await prisma.user.findMany({
    where: { plan: UserPlan.STANDARD },
    include: {
      iapReceipts: {
        orderBy: { purchasedAt: 'asc' },
        take: 1, // 最古の購入レコード
      },
    },
  });

  console.log(`Found ${standardUsers.length} STANDARD users`);

  let migrated = 0;
  let errors = 0;

  for (const user of standardUsers) {
    try {
      const startDate = user.iapReceipts[0]?.purchasedAt ?? user.createdAt;
      const endDate = DateTime.fromJSDate(startDate).plus({ days: 365 }).toJSDate();

      // 既に PremiumGrant がある場合はスキップ
      const existingGrant = await prisma.premiumGrant.findFirst({
        where: { userId: user.id, source: PremiumSource.PURCHASE },
      });

      if (existingGrant) {
        console.log(`User ${user.id} already has a PremiumGrant, skipping`);
        continue;
      }

      // PremiumGrant 作成
      await prisma.premiumGrant.create({
        data: {
          userId: user.id,
          source: PremiumSource.PURCHASE,
          days: 365,
          startDate,
          endDate,
          iapReceiptId: user.iapReceipts[0]?.id,
        },
      });

      migrated++;
      console.log(`Migrated user ${user.id} (${user.email})`);
    } catch (error) {
      console.error(`Error migrating user ${user.id}:`, error);
      errors++;
    }
  }

  console.log(`Migration completed: ${migrated} migrated, ${errors} errors`);
}

migrateUserPlanToPremiumGrant()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [x] スクリプト作成
- [ ] ステージング環境でテスト
- [ ] 本番環境で実行
- [ ] 実行ログを保存

---

## 3. 既存コードの修正

### 3.1 PremiumService 新規作成

#### ✅ チェックリスト: `apps/server/src/services/premium-service.ts`

```typescript
// apps/server/src/services/premium-service.ts
// プレミアム状態を判定・管理するサービス
// PremiumGrantテーブルを参照してプレミアム状態を判定
// 関連: ai-usage-service, log-cleanup, iap-service

import { prisma } from '../db/prisma.js';
import { PremiumSource } from '@prisma/client';
import { DateTime } from 'luxon';

export interface PremiumStatus {
  isPremium: boolean;
  source: PremiumSource | null;
  daysRemaining: number;
  expiresAt: Date | null;
}

export async function isPremium(userId: number): Promise<boolean> {
  const activeGrant = await prisma.premiumGrant.findFirst({
    where: {
      userId,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
    orderBy: { endDate: 'desc' },
  });
  return activeGrant !== null;
}

export async function getPremiumStatus(userId: number): Promise<PremiumStatus> {
  const activeGrant = await prisma.premiumGrant.findFirst({
    where: {
      userId,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
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

  const now = DateTime.now();
  const expiresAt = DateTime.fromJSDate(activeGrant.endDate);
  const daysRemaining = Math.ceil(expiresAt.diff(now, 'days').days);

  return {
    isPremium: true,
    source: activeGrant.source,
    daysRemaining,
    expiresAt: activeGrant.endDate,
  };
}

export async function getAllPremiumGrants(userId: number) {
  return prisma.premiumGrant.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function grantPremiumDays(params: {
  userId: number;
  source: PremiumSource;
  days: number;
  referralId?: number;
  iapReceiptId?: number;
}): Promise<void> {
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
```

- [x] `premium-service.ts` を新規作成
- [x] `isPremium()` 実装
- [x] `getPremiumStatus()` 実装
- [x] `grantPremiumDays()` 実装
- [x] `getAllPremiumGrants()` 実装
- [x] `filterPremiumUserIds()` 実装
- [x] `getAllPremiumUserIds()` 実装
- [ ] ユニットテスト作成（優先度: 中）

### 3.2 AI使用制限サービスの修正

#### ✅ チェックリスト: `apps/server/src/services/ai-usage-service.ts`

**主要な変更**:

```typescript
// 修正前
import { UserPlan } from '@prisma/client';
const DAILY_LIMITS: Record<UserPlan, number> = {
  FREE: 3,
  STANDARD: 20,
};

// 修正後
import { isPremium } from './premium-service.js';
const DAILY_LIMITS: Record<'FREE' | 'PREMIUM', number> = {
  FREE: 3,
  PREMIUM: 20,
};

export async function evaluateAiUsage(userId: number): Promise<AiUsageStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCredits: true },
  });

  if (!user) {
    throw new Error('AI 利用状況の確認対象ユーザーが見つかりませんでした');
  }

  const premiumUser = await isPremium(userId);
  const plan = premiumUser ? 'PREMIUM' : 'FREE';
  const limit = DAILY_LIMITS[plan];

  // ... 残りのロジック
}
```

- [x] `UserPlan` import を削除
- [x] `isPremium()` を使ってプレミアム判定
- [x] `DAILY_LIMITS` の型を変更
- [x] `resolveTierOverride()` に変更（USER_TIER_OVERRIDE環境変数を使用）
- [x] ユニットテスト修正
- [x] 統合テスト実行（CI通過）

### 3.3 ログクリーンアップジョブの修正

#### ✅ チェックリスト: `apps/server/src/jobs/log-cleanup.ts`

**主要な変更**:

```typescript
// 修正前
import { UserPlan } from '@prisma/client';

await prisma.mealLog.deleteMany({
  where: {
    deletedAt: null,
    createdAt: { lt: cutoff },
    user: { plan: UserPlan.FREE },
  },
});

// 修正後
const FREE_RETENTION_DAYS = 30;
const PREMIUM_RETENTION_DAYS = 90;

export async function purgeExpiredMealLogs(referenceDate: Date = new Date()) {
  const now = DateTime.fromJSDate(referenceDate).setZone(CLEANUP_TIMEZONE);
  const freeUserCutoff = now.minus({ days: FREE_RETENTION_DAYS }).toJSDate();
  const premiumUserCutoff = now.minus({ days: PREMIUM_RETENTION_DAYS }).toJSDate();
  const deletionCutoff = now.minus({ days: DELETION_GRACE_DAYS }).toJSDate();

  // プレミアムユーザーのIDリストを取得
  const premiumUserIds = await prisma.premiumGrant.findMany({
    where: {
      startDate: { lte: now.toJSDate() },
      endDate: { gte: now.toJSDate() },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  const premiumIds = new Set(premiumUserIds.map((g) => g.userId));

  const [softDeleted, freeExpired, premiumExpired] = await Promise.all([
    // Soft-deleted logs（30日後に完全削除）
    prisma.mealLog.deleteMany({
      where: {
        deletedAt: { not: null, lt: deletionCutoff },
      },
    }),

    // 無料ユーザーのログ（30日後に削除）
    prisma.mealLog.deleteMany({
      where: {
        deletedAt: null,
        createdAt: { lt: freeUserCutoff },
        userId: { notIn: Array.from(premiumIds) },
      },
    }),

    // プレミアムユーザーのログ（90日後に削除）
    prisma.mealLog.deleteMany({
      where: {
        deletedAt: null,
        createdAt: { lt: premiumUserCutoff },
        userId: { in: Array.from(premiumIds) },
      },
    }),
  ]);

  return {
    softDeleted: softDeleted.count,
    freeExpired: freeExpired.count,
    premiumExpired: premiumExpired.count,
  };
}
```

- [x] `UserPlan` import を削除
- [x] プレミアムユーザーID取得ロジック追加
- [x] 無料/プレミアム別の削除処理実装
- [x] `PREMIUM_RETENTION_DAYS = 90` を追加
- [x] ユニットテスト修正
- [x] 統合テスト実行（CI通過）

### 3.4 課金購入サービスの修正

#### ✅ チェックリスト: `apps/server/src/services/iap-service.ts`

**主要な変更**:

```typescript
// 修正後
import { grantPremiumDays } from './premium-service.js';

export async function processIapPurchase(params: ProcessPurchaseParams): Promise<...> {
  // ... レシート検証

  await prisma.$transaction(async (tx) => {
    const receipt = await tx.iapReceipt.create({
      data: {
        userId: params.userId,
        platform,
        productId: verification.productId,
        transactionId: verification.transactionId,
        environment: verification.environment,
        quantity: verification.quantity,
        creditsGranted,
        status: 'VERIFIED',
        purchasedAt: verification.purchaseDate,
        payload: verification.raw as any,
      },
    });

    await tx.user.update({
      where: { id: params.userId },
      data: { aiCredits: { increment: creditsGranted } },
    });

    // ★ 新規追加: PremiumGrant作成（1年間）
    await tx.premiumGrant.create({
      data: {
        userId: params.userId,
        source: 'PURCHASE',
        days: 365,
        startDate: new Date(),
        endDate: DateTime.now().plus({ days: 365 }).toJSDate(),
        iapReceiptId: receipt.id,
      },
    });
  });

  // ... 残りのロジック
}
```

- [x] PremiumGrant作成（1年間、365日）
- [x] `User.plan` 更新処理を削除
- [x] ユニットテスト修正
- [x] 統合テスト実行（CI通過）

### 3.5 認証サービスの修正

#### ✅ チェックリスト: `apps/server/src/services/auth-service.ts`

**主要な変更**:

```typescript
// 修正前
function serializeUser(user: {
  id: number;
  email: string;
  username: string | null;
  plan: UserPlan;
  aiCredits: number;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? undefined,
    plan: user.plan,
    aiCredits: user.aiCredits,
  };
}

// 修正後
function serializeUser(user: {
  id: number;
  email: string;
  username: string | null;
  aiCredits: number;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? undefined,
    aiCredits: user.aiCredits,
  };
}

// resolvePlanOverride() を削除
// withPlanOverride() を削除
```

- [x] `plan` フィールドの参照をすべて削除
- [x] `resolvePlanOverride()` 関数を削除
- [x] `withPlanOverride()` 関数を削除
- [x] セッションから `userPlan` を削除（`types/express-session.d.ts`）
- [x] ユニットテスト修正

### 3.6 セッション型定義の修正

#### ✅ チェックリスト: `apps/server/src/types/express-session.d.ts`

```typescript
// 修正前
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    userPlan?: UserPlan;
    aiCredits?: number;
  }
}

// 修正後
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    aiCredits?: number;
    // userPlan を削除
  }
}
```

- [x] `userPlan` フィールドを削除
- [x] `UserPlan` import を削除

---

## 4. バックエンドAPI設計（紹介制度）

### 4.1 招待リンク生成API

#### ✅ エンドポイント: `POST /api/referral/invite-link`

**リクエスト**:
```json
{
  "timezone": "Asia/Tokyo"
}
```

**レスポンス**:
```json
{
  "inviteLink": "meallog://invite?code=A3K9Px",
  "webLink": "https://meal-log.app/invite?code=A3K9Px",
  "code": "A3K9Px",
  "message": "友だち1人で30日延長"
}
```

**実装タスク**:
- [x] `/api/referral/invite-link` ルート作成
- [x] ユーザーごとに一意の短縮コード生成（6文字、A-Za-z0-9）
- [x] `ReferralInviteLink` テーブルに保存（既存なら再利用）
- [x] ディープリンク + Webランディングページ両方のURLを返却
- [x] 認証必須（セッションチェック）
- [x] referral-service.ts実装完了
- [x] CI通過

### 4.2 招待コード検証・紐付けAPI

#### ✅ エンドポイント: `POST /api/referral/claim`

**リクエスト**:
```json
{
  "code": "A3K9Px",
  "timezone": "Asia/Tokyo"
}
```

**レスポンス**:
```json
{
  "success": true,
  "premiumDays": 14,
  "premiumUntil": "2025-11-06T23:59:59Z",
  "referrerUsername": "TaroYamada"
}
```

**実装タスク**:
- [x] `/api/referral/claim` ルート作成
- [x] 招待コードの存在確認
- [x] 重複防止チェック（同一ユーザーが複数回使用不可）
- [x] 自己紹介防止（referrerUserId ≠ referredUserId）
- [x] デバイス指紋生成・記録（SHA256ハッシュ）
- [x] `Referral` レコード作成（status: PENDING）
- [x] **友だちに14日プレミアム付与**（PremiumGrant作成）
- [x] `ReferralInviteLink` の `signupCount` をインクリメント
- [x] 認証必須
- [x] referral-service.ts実装完了
- [x] CI通過

### 4.3 プレミアム状態取得API

#### ✅ エンドポイント: `GET /api/user/premium-status`

**レスポンス**:
```json
{
  "isPremium": true,
  "source": "REFERRAL_FRIEND",
  "daysRemaining": 12,
  "expiresAt": "2025-11-06T23:59:59Z",
  "grants": [
    {
      "source": "REFERRAL_FRIEND",
      "days": 14,
      "startDate": "2025-10-23T00:00:00Z",
      "endDate": "2025-11-06T23:59:59Z"
    }
  ]
}
```

**実装タスク**:
- [x] `/api/user/premium-status` ルート作成
- [x] `getPremiumStatus()` を使ってプレミアム状態取得
- [x] ユーザーの全 `PremiumGrant` を取得
- [x] 認証必須
- [x] routes/account.ts実装完了
- [x] CI通過

### 4.4 紹介状況取得API

#### ✅ エンドポイント: `GET /api/referral/my-status`

**レスポンス**:
```json
{
  "inviteCode": "A3K9Px",
  "inviteLink": "meallog://invite?code=A3K9Px",
  "stats": {
    "totalReferred": 5,
    "completedReferred": 2,
    "pendingReferred": 3,
    "totalPremiumDaysEarned": 60
  },
  "recentReferrals": [
    {
      "friendUsername": "HanakoSato",
      "status": "COMPLETED",
      "consecutiveDays": 3,
      "createdAt": "2025-10-20T10:00:00Z",
      "completedAt": "2025-10-23T10:00:00Z"
    }
  ]
}
```

**実装タスク**:
- [x] `/api/referral/my-status` ルート作成
- [x] ユーザーの招待コードを取得
- [x] ユーザーの全 `Referral` を取得（referrerUserId）
- [x] 統計情報を計算（total, completed, pending, days earned）
- [x] 最新5件の紹介状況を返却
- [x] 認証必須
- [x] referral-service.ts実装完了
- [x] CI通過

### 4.5 3日連続ログチェックジョブ

#### ✅ バッチジョブ: `check-referral-completion`

**実行頻度**: 1日1回（午前3時 JST）

**処理内容**:
1. `Referral` テーブルから `status = PENDING` のレコードを全取得
2. 各レコードについて、被紹介者（referredUser）の `MealLog` を確認
3. 直近3日間に連続してログがあるか判定
4. 達成していれば:
   - `Referral.status` を `COMPLETED` に更新
   - **紹介者に30日プレミアム付与**（`grantPremiumDays()` 使用）
   - `Referral.referrerPremiumGranted` を true に設定
5. 30日経過しても未達成なら:
   - `Referral.status` を `EXPIRED` に更新

**実装タスク**:
- [x] `apps/server/src/jobs/check-referral-completion.ts` 作成
- [x] 3日連続ログ判定ロジック実装（referral-service.ts内）
- [x] PremiumGrant作成で30日付与
- [x] 30日期限切れチェック実装（expireOldReferrals）
- [x] index.tsにスケジューリング追加（毎日3時JST実行）
- [x] ログ出力（Pino）
- [x] CI通過

---

## 5. フロントエンド（Mobile）実装

### 5.1 招待リンク生成・共有機能

#### ✅ 実装箇所: `apps/mobile/app/(tabs)/settings.tsx`

**変更内容**:
- [x] `handleInvite` 関数を実装
  - API `/api/referral/invite-link` を呼び出し
  - 招待リンクを取得
  - `Share.share()` で共有メニューを表示
    - タイトル: 「Meal Logを一緒に使いませんか？」
    - メッセージ: 「紹介リンクから登録すると14日間プレミアム無料！友だちを紹介すると30日延長も！ {inviteLink}」
- [ ] 共有チャネルボタン追加（**LINEをプライマリ**、他をセカンダリ）（優先度: 低、将来実装）
  - **LINE**: `line://msg/text/{message}` - **大きく目立つボタン**
  - Instagram: DM不可、ストーリー投稿のみ（`instagram://story-camera`）- 小さめボタン
  - X: `twitter://post?message={message}` - 小さめボタン
  - WhatsApp: `whatsapp://send?text={message}` - 小さめボタン
- [x] エラーハンドリング（ネットワークエラー、APIエラー）
- [x] ローディング状態表示

#### ✅ 翻訳追加: `apps/mobile/src/i18n/index.ts`

- [x] `referral.share.title`: 「Meal Logを一緒に使いませんか？」
- [x] `referral.share.message`: 「このリンクから登録すると14日間プレミアム無料！友だちを紹介すると30日延長も！ {{link}}」
- [x] `referral.invite.rewardText`: 「友だち1人で30日延長」
- [x] `referral.friend.rewardText`: 「紹介なら14日間プレミアム無料」
- [x] `referral.error.loadFailed`: 「招待リンクの取得に失敗しました」
- [x] `referral.error.shareFailed`: 「共有に失敗しました」
- [x] 紹介状況画面用の翻訳も追加
- [x] 英語版も追加

### 5.2 ディープリンク受信・処理

#### ✅ 実装箇所: `apps/mobile/app/_layout.tsx`

**変更内容**:
- [ ] `expo-linking` の `useURL()` でディープリンクを監視
- [ ] `meallog://invite?code={code}` を検出
- [ ] ログイン済みの場合:
  - API `/api/referral/claim` を呼び出し
  - 成功時: トースト表示「14日間プレミアムを獲得しました！」
  - 失敗時: エラーメッセージ表示
- [ ] 未ログインの場合:
  - 招待コードを一時保存（AsyncStorage: `@referral_code`）
  - ログイン画面に遷移
  - ログイン後に自動で `/api/referral/claim` を実行

**実装タスク**:
- [ ] `apps/mobile/src/hooks/useReferralDeepLink.ts` 作成
- [ ] `_layout.tsx` に統合
- [ ] AsyncStorageでコード一時保存
- [ ] ログイン後の自動claim実装
- [ ] トースト通知実装

### 5.3 紹介状況画面

#### ✅ 新規画面: `apps/mobile/app/referral-status.tsx`

**UI構成**:
1. ヘッダー: 「紹介プログラム」
2. 招待カード:
   - 招待コード表示
   - コピーボタン
   - 共有ボタン
3. 統計カード:
   - 紹介人数（合計/達成/待機中）
   - 獲得プレミアム日数
4. 紹介リスト:
   - 友だちのユーザー名（匿名化: "User_1234"）
   - ステータス（達成/待機中/期限切れ）
   - 連続日数バッジ（"2/3日" など）
   - 達成日時

**実装タスク**:
- [ ] `apps/mobile/app/referral-status.tsx` 作成
- [ ] API `/api/referral/my-status` と統合
- [ ] リスト表示（FlatList）
- [ ] コピー機能実装（Clipboard API）
- [ ] 共有機能実装（Share API）
- [ ] 設定画面からのナビゲーション追加

### 5.4 プレミアムバッジ・残日数表示

#### ✅ 実装箇所: ダッシュボード、設定画面

**変更内容**:
- [ ] API `/api/user/premium-status` を呼び出し
- [ ] プレミアム状態を Zustand store に保存
- [ ] ダッシュボードにプレミアムバッジ表示
  - アイコン: ⭐️ or 👑
  - テキスト: 「プレミアム会員（残り12日）」
- [ ] 設定画面のプロフィールカードにバッジ追加
- [ ] プレミアム限定機能に鍵アイコン表示（無料ユーザー）

**実装タスク**:
- [ ] `apps/mobile/src/store/premium.ts` 作成（Zustand）
- [ ] `/api/user/premium-status` 統合
- [ ] ダッシュボードにバッジ表示
- [ ] 設定画面にバッジ表示
- [ ] プレミアム限定機能のペイウォール実装

---

## 6. プレミアム特典実装

### 6.1 月間カロリー差分表示（既存機能の制限追加）

- [x] 既に実装済み（`dashboard.tsx`）
- [ ] `isPremium()` を使ってプレミアム会員のみ表示
- [ ] 無料ユーザーには鍵アイコン + 「プレミアム限定」表示
- [ ] ペイウォールタップ時に紹介プログラム画面へ誘導

### 6.2 AI使用制限緩和

- [x] 既に実装済み（`ai-usage-service.ts` で対応）
- [ ] プレミアムユーザー: 1日20回
- [ ] 無料ユーザー: 1日3回

### 6.3 履歴90日保存（新機能・プレミアム特典）

#### ✅ 実装内容

**バックエンド**:
- [x] `log-cleanup.ts` で対応済み
- [ ] プレミアムユーザー: 90日保存
- [ ] 無料ユーザー: 30日保存

**フロントエンド**:
- [ ] 履歴画面に期間選択追加（「1か月」「3か月」）
- [ ] 無料ユーザーには「3か月」オプションを非表示
- [ ] プレミアム誘導メッセージ表示（「90日履歴を見るには友だちを招待してプレミアムへ！」）
- [ ] 誘導ボタンタップ時に紹介プログラム画面へ遷移

---

## 7. 不正検知・セキュリティ

### 7.1 重複防止

#### ✅ チェック項目

- [ ] メールアドレス重複チェック（既存ユーザー検出）
- [ ] 同一ユーザーが複数の招待コードを使用できないようにする
  - `Referral.referredUserId` は UNIQUE 制約
- [ ] 自己紹介防止（referrerUserId ≠ referredUserId）
- [ ] IPアドレス + User-Agentのハッシュを記録（簡易デバイス指紋）
  - `Referral` テーブルに `deviceFingerprint` カラム使用
  - 同一fingerprintで複数アカウント作成を検知
- [ ] 短期間での大量紹介を検知（1時間に10人以上 = 疑わしい）
  - 管理者通知（メール or Slack）

**実装タスク**:
- [ ] `/api/referral/claim` に重複チェックロジック追加
- [ ] IPアドレス取得（`req.ip`）
- [ ] User-Agent取得（`req.headers['user-agent']`）
- [ ] デバイス指紋生成（SHA256ハッシュ）
- [ ] 大量紹介検知アラート実装

### 7.2 不正パターン検知

#### ✅ 監視項目

- [ ] 登録後すぐに削除されるアカウント（1週間以内に削除 = 疑わしい）
- [ ] 3日連続ログがすべて同一内容（コピペ疑惑）
- [ ] 登録後のアクティビティが異常に低い（1週間で1回のみ）
- [ ] プレミアム期間終了直前に大量紹介（駆け込み紹介）

**実装タスク**:
- [ ] 不正検知ジョブ作成（`detect-referral-fraud.ts`）
- [ ] 疑わしいパターンを `Referral.status = FRAUD` に更新
- [ ] 管理者ダッシュボードに疑わしいユーザーリスト表示（将来実装）

---

## 8. Analytics & KPI計測

### 8.1 イベントトラッキング

#### ✅ 実装タスク

- [ ] `referral.invite_link_generated`: 招待リンク生成
- [ ] `referral.invite_link_shared`: 共有ボタンクリック（チャネル記録）
- [ ] `referral.invite_link_clicked`: 招待リンククリック
- [ ] `referral.signup_via_referral`: 紹介経由でサインアップ
- [ ] `referral.premium_claimed_friend`: 友だちがプレミアム獲得
- [ ] `referral.premium_claimed_referrer`: 紹介者がプレミアム獲得
- [ ] `referral.conversion_to_paid`: 紹介経由ユーザーが課金

**実装箇所**:
- [ ] `apps/mobile/src/analytics/events.ts` にイベント定義追加
- [ ] 各API・画面で `trackEvent()` 呼び出し

### 8.2 KPIダッシュボード（管理者用）

#### ✅ 計測指標

- [ ] K係数（1ユーザーあたり紹介人数）
- [ ] 紹介経由サインアップ数（日次/週次/月次）
- [ ] 3日連続達成率（COMPLETED / TOTAL）
- [ ] 30日以内有料化率（紹介経由 vs 自然流入）
- [ ] プレミアム付与コスト（付与日数 × 人数）
- [ ] 不正検知数

**実装タスク**:
- [ ] 管理者用APIエンドポイント作成（`/admin/referral/stats`）
- [ ] SQL集計クエリ実装
- [ ] 簡易ダッシュボード実装（将来: Metabase or Retool統合）

---

## 9. テスト計画

### 9.1 ユニットテスト

- [ ] `PremiumService.isPremium()` テスト
- [ ] `PremiumService.grantPremiumDays()` テスト
- [ ] `ReferralService.createInviteLink()` テスト
- [ ] `ReferralService.claimReferral()` テスト（重複防止）
- [ ] `ReferralService.checkConsecutiveDays()` テスト（3日連続判定）
- [ ] デバイス指紋生成テスト
- [ ] マイグレーションスクリプトのテスト

### 9.2 統合テスト

- [ ] エンドツーエンド: 招待リンク生成 → 友だち登録 → プレミアム付与
- [ ] エンドツーエンド: 3日連続ログ → 紹介者プレミアム付与
- [ ] 重複防止: 同一ユーザーが複数回使用できないことを確認
- [ ] 自己紹介防止: 自分自身を紹介できないことを確認
- [ ] 期限切れ: 30日経過後にEXPIREDになることを確認
- [ ] プレミアム期間終了後のログ削除テスト
- [ ] マイグレーション前後のデータ整合性テスト

### 9.3 手動テスト

- [ ] iOS実機でディープリンク動作確認
- [ ] 共有メニュー動作確認（LINE, X, WhatsApp）
- [ ] プレミアムバッジ表示確認
- [ ] 紹介状況画面の表示確認
- [ ] エラーハンドリング確認（ネットワークエラー、不正コード）
- [ ] マイグレーション実行後の動作確認

---

## 10. デプロイ計画

### 10.1 Phase 0: マイグレーション準備（2日）

**実装範囲**:
- マイグレーションスクリプト作成
- ステージング環境でテスト実行
- 本番データのバックアップ計画

**推定工数**: 2日

**リリース判定基準**:
- [ ] マイグレーションスクリプトが正常に動作
- [ ] ステージング環境でデータ整合性確認
- [ ] ロールバック手順の確認

### 10.2 Phase 1: 基本機能 + マイグレーション実行（10日）

**実装範囲**:
- DB設計・マイグレーション実行
- PremiumService 新規作成
- 既存コード修正（ai-usage, log-cleanup, iap, auth）
- バックエンドAPI（招待リンク生成、claim、プレミアム状態取得）
- フロントエンド（招待リンク生成・共有、ディープリンク受信）
- 3日連続チェックジョブ
- プレミアムバッジ表示

**推定工数**: 10日

**リリース判定基準**:
- [ ] 全ユニットテストパス
- [ ] 全統合テストパス
- [ ] iOS実機で手動テスト完了
- [ ] ステージング環境でE2Eテスト完了
- [ ] マイグレーション実行後の動作確認完了

### 10.3 Phase 2: 不正検知・Analytics（3日）

**実装範囲**:
- 不正検知ジョブ
- IPアドレス・デバイス指紋記録
- Analyticsイベントトラッキング
- 管理者用KPIダッシュボード

**推定工数**: 3日

**リリース判定基準**:
- [ ] 不正検知ジョブが正常動作
- [ ] Analyticsイベントが記録されている
- [ ] 管理者ダッシュボードでKPI確認可能

### 10.4 Phase 3: Android対応・Universal Links（4日）

**実装範囲**:
- Android版ディープリンク対応
- Universal Links設定（`/.well-known/apple-app-site-association`）
- 未インストール時のランディングページ作成
- ストア自動遷移実装

**推定工数**: 4日

**リリース判定基準**:
- [ ] iOS未インストール時にApp Storeに遷移
- [ ] Android未インストール時にGoogle Playに遷移
- [ ] インストール後に招待コードが自動適用

---

## 11. リスク管理

### 11.1 高リスク項目

| リスク | 影響 | 緩和策 | 担当 |
|--------|------|--------|------|
| マイグレーション失敗 | 高 | ステージング環境でテスト、ロールバック計画 | Backend |
| 不正ユーザーの大量発生 | 高 | デバイス指紋、管理者通知、手動レビュー | Backend |
| ディープリンクが動作しない | 中 | フォールバック（手動コード入力） | Mobile |
| プレミアム期間の計算ミス | 高 | ユニットテスト徹底、手動検証 | Backend |
| iOS審査で紹介制度が却下 | 高 | App Store審査ガイドライン確認（3.2.2） | PM |

### 11.2 ロールバック計画

- [ ] Phase 1リリース後、1週間は機能フラグでON/OFF切り替え可能にする
- [ ] 緊急時はフロントエンドで招待カードを非表示にする
- [ ] マイグレーション失敗時はバックアップから復元
- [ ] DBテーブルは残し、ロジックのみ無効化

---

## 12. 成功指標・モニタリング

### 12.1 初期目標（リリース後30日）

- [ ] K係数 ≥ **0.3**（初期フェーズ）
- [ ] 紹介経由サインアップ数 ≥ 100人
- [ ] 3日連続達成率 ≥ 40%
- [ ] 30日以内有料化率 ≥ 10%（紹介経由）

### 12.2 中期目標（リリース後90日）

- [ ] K係数 ≥ **0.5**（主要KPI）
- [ ] 紹介経由サインアップ数 ≥ 500人
- [ ] 3日連続達成率 ≥ 50%
- [ ] 30日以内有料化率 ≥ 15%（紹介経由）
- [ ] プレミアム継続率（紹介経由） ≥ 30%（プレミアム期間終了後に課金）

### 12.3 アラート設定

- [ ] 不正検知数が1日10件を超えたらSlack通知
- [ ] 3日連続達成率が20%を下回ったらアラート（設計見直し）
- [ ] K係数が0.2を下回ったらアラート（プロモーション強化）

---

## 13. 未解決事項・今後の検討

- [ ] Android版の優先順位を再検討（ユーザーからの要望次第）
- [ ] プレミアム特典の追加検討（AI翻訳無制限、エクスポート機能など）
- [ ] 紹介ランキング機能（上位10名にボーナス）
- [ ] 法務レビュー（利用規約に紹介制度の記載追加）
- [ ] LINEでの共有体験を最適化（OGP画像、メタデータ）

---

## 14. 関連ドキュメント

- `_docs/thinking/20251023_referral-program-review.md`: マーケティング観点のレビュー
- `_docs/thinking/20251023_referral-program-conflicts-analysis.md`: 現状プロジェクトとの整合性調査
- `_docs/features/20251023_referral-program-summary.md`: 確定仕様サマリー
- `_docs/features/20251023_referral-program-implementation-plan.md`: 旧実装計画書（v1、参考用）
- `_docs/specs/api-referral.md`: APIエンドポイント仕様（作成予定）
- `README.md`: 環境構築手順
- `Agent.md`: 開発プロトコル

---

**最終更新**: 2025-10-23  
**次回レビュー**: Phase 1実装完了後（推定11月上旬）  
**バージョン**: v2（案A採用版）
