# 紹介制度実装計画 - 現状プロジェクトとの整合性チェック

**更新日**: 2025-10-23  
**ステータス**: 調査完了

---

## 🔍 調査結果サマリー

### ✅ 問題なし（整合性あり）

1. **認証・セッション管理**: 問題なし
2. **ディープリンク設定**: 問題なし
3. **新規テーブル追加**: 問題なし
4. **API ルート追加**: 問題なし

### ⚠️ 設計変更が必要（重要な矛盾）

1. **User.plan と PremiumGrant の関係性** - **最重要**
2. **クリーンアップジョブの拡張** - 重要
3. **AI使用制限との統合** - 中程度

---

## 1. 【⚠️ 重要】User.plan と PremiumGrant の設計矛盾

### 現状の実装

#### User.plan の使われ方

```typescript
// apps/server/prisma/schema.prisma
model User {
  plan UserPlan @default(FREE)
  // ...
}

enum UserPlan {
  FREE
  STANDARD
}
```

**現在の用途**:
1. **AI使用制限の判定** (`ai-usage-service.ts`)
   - FREE: 1日3回
   - STANDARD: 1日20回

2. **ログ保存期間の判定** (`log-cleanup.ts`)
   - FREE: 30日後に削除
   - STANDARD: 削除なし（現状は無制限）

3. **課金状態の表現**
   - `User.plan = STANDARD` = 課金済みユーザー
   - `IapReceipt` テーブルで課金履歴を管理

### 実装計画での設計

#### PremiumGrant の導入

```typescript
model PremiumGrant {
  id          Int             @id @default(autoincrement())
  user        User            @relation(fields: [userId], references: [id])
  userId      Int
  source      PremiumSource   // REFERRAL_FRIEND, REFERRAL_REFERRER, PURCHASE, ADMIN_GRANT
  days        Int
  startDate   DateTime
  endDate     DateTime
  // ...
}
```

**意図した用途**:
- 紹介プログラムによる一時的なプレミアム期間管理
- 課金購入とは別の仕組み

---

## 🚨 問題点：2つのプレミアム管理システムが併存

### 矛盾の詳細

| 要素 | 既存（User.plan） | 新規（PremiumGrant） |
|------|------------------|---------------------|
| **課金購入** | `User.plan = STANDARD` に変更 | `PremiumGrant` に記録 |
| **紹介プログラム** | 対応なし | `PremiumGrant` に記録 |
| **AI制限判定** | `User.plan` を参照 | ❌ `PremiumGrant` は参照されない |
| **ログ保存期間** | `User.plan` を参照 | ❌ `PremiumGrant` は参照されない |
| **プレミアム状態** | `User.plan = STANDARD` | `PremiumGrant.endDate > now` |

### 具体的な問題シナリオ

#### シナリオ1: 紹介経由でプレミアム獲得したユーザー

```
1. ユーザーが紹介リンクから登録
2. PremiumGrant が作成される（endDate: +14日）
3. しかし User.plan = FREE のまま
4. AI制限判定では FREE として扱われる（1日3回）← ❌ 期待: 1日20回
5. ログ保存期間も30日のまま ← ❌ 期待: 90日
```

#### シナリオ2: 課金購入とPremiumGrantの競合

```
1. ユーザーが紹介で14日プレミアム獲得（PremiumGrant作成）
2. その後、課金購入する（IapReceipt作成、User.plan = STANDARD）
3. PremiumGrant の期間が終了
4. User.plan は STANDARD のまま（課金なので正しい）
5. しかし、紹介プレミアムと課金プレミアムの区別がつかない
```

---

## 💡 解決策の提案

### 案A: User.plan を廃止し、PremiumGrant に統一【推奨】

#### 変更内容

1. **User.plan を削除**
   - `User.plan` フィールドを廃止
   - すべてのプレミアム状態を `PremiumGrant` で管理

2. **プレミアム判定ロジックを統一**

```typescript
// services/premium-service.ts（新規作成）
async function isPremium(userId: number): Promise<boolean> {
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

async function getActivePremiumSource(userId: number): Promise<PremiumSource | null> {
  const activeGrant = await prisma.premiumGrant.findFirst({
    where: {
      userId,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
    orderBy: { endDate: 'desc' },
  });
  return activeGrant?.source ?? null;
}
```

3. **AI使用制限の変更**

```typescript
// ai-usage-service.ts
const DAILY_LIMITS: Record<'FREE' | 'PREMIUM', number> = {
  FREE: 3,
  PREMIUM: 20,
};

export async function evaluateAiUsage(userId: number): Promise<AiUsageStatus> {
  const isPremiumUser = await isPremium(userId);
  const plan = isPremiumUser ? 'PREMIUM' : 'FREE';
  const limit = DAILY_LIMITS[plan];
  // ...
}
```

4. **ログクリーンアップの変更**

```typescript
// jobs/log-cleanup.ts
const FREE_RETENTION_DAYS = 30;
const PREMIUM_RETENTION_DAYS = 90;

export async function purgeExpiredMealLogs(referenceDate: Date = new Date()) {
  // プレミアムユーザーのIDリストを取得
  const premiumUserIds = await prisma.premiumGrant.findMany({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  const premiumIds = new Set(premiumUserIds.map(g => g.userId));

  // 無料ユーザーのログ削除（30日）
  await prisma.mealLog.deleteMany({
    where: {
      deletedAt: null,
      createdAt: { lt: now.minus({ days: FREE_RETENTION_DAYS }).toJSDate() },
      userId: { notIn: Array.from(premiumIds) },
    },
  });

  // プレミアムユーザーのログ削除（90日）
  await prisma.mealLog.deleteMany({
    where: {
      deletedAt: null,
      createdAt: { lt: now.minus({ days: PREMIUM_RETENTION_DAYS }).toJSDate() },
      userId: { in: Array.from(premiumIds) },
    },
  });
}
```

5. **課金購入時の変更**

```typescript
// iap-service.ts
export async function processIapPurchase(params: ProcessPurchaseParams): Promise<...> {
  // IapReceipt 作成後
  await prisma.premiumGrant.create({
    data: {
      userId: params.userId,
      source: 'PURCHASE',
      days: 365, // 1年間
      startDate: new Date(),
      endDate: DateTime.now().plus({ days: 365 }).toJSDate(),
      iapReceiptId: receipt.id,
    },
  });
  
  // User.plan は更新しない（削除するため）
}
```

#### メリット
- ✅ 紹介プレミアムと課金プレミアムを統一的に管理
- ✅ 一時的なプレミアム期間（14日、30日）と課金プレミアム（1年）を同じ仕組みで扱える
- ✅ プレミアム状態の判定ロジックが1箇所に集約
- ✅ 将来的な拡張が容易（キャンペーン、トライアル等）

#### デメリット
- ⚠️ 既存ユーザーのマイグレーションが必要
- ⚠️ 既存コードの修正範囲が広い（ai-usage-service, log-cleanup, auth-service）

---

### 案B: User.plan を残し、PremiumGrant と併用【妥協案】

#### 変更内容

1. **プレミアム判定ロジックを2段階に**

```typescript
// services/premium-service.ts（新規作成）
async function isPremium(userId: number): Promise<boolean> {
  // 1. User.plan が STANDARD ならプレミアム
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (user?.plan === 'STANDARD') return true;

  // 2. PremiumGrant に有効な期間があればプレミアム
  const activeGrant = await prisma.premiumGrant.findFirst({
    where: {
      userId,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
  });
  return activeGrant !== null;
}
```

2. **課金購入時は User.plan を STANDARD に**
3. **紹介プログラムは PremiumGrant のみ**

#### メリット
- ✅ 既存コードの修正が少ない
- ✅ マイグレーションが不要

#### デメリット
- ❌ 2つのプレミアム管理システムが併存（複雑）
- ❌ プレミアム状態の判定が2箇所に分散
- ❌ 将来的なメンテナンスコストが高い

---

## 2. 【中】クリーンアップジョブの拡張

### 現状

```typescript
// jobs/log-cleanup.ts
const FREE_RETENTION_DAYS = 30;

// 無料ユーザーのログを30日後に削除
await prisma.mealLog.deleteMany({
  where: {
    deletedAt: null,
    createdAt: { lt: cutoff },
    user: { plan: UserPlan.FREE },
  },
});
```

### 必要な変更

実装計画では「プレミアムユーザーは90日保存」と記載されているが、現状のコードでは：
- FREE: 30日後に削除
- STANDARD: **削除されない**（無制限保存）

#### 提案

```typescript
const FREE_RETENTION_DAYS = 30;
const PREMIUM_RETENTION_DAYS = 90;

// プレミアムユーザーのログも90日後に削除
await prisma.mealLog.deleteMany({
  where: {
    deletedAt: null,
    createdAt: { lt: now.minus({ days: PREMIUM_RETENTION_DAYS }).toJSDate() },
    user: { plan: UserPlan.STANDARD }, // または isPremium() で判定
  },
});
```

---

## 3. 【低】ディープリンク設定

### 現状

```json
// apps/mobile/app.json
{
  "scheme": "meallog"
}
```

### 確認結果

- ✅ 既に `meallog://` スキームが設定済み
- ✅ `meallog://invite?code=xxx` の形式で使用可能
- ✅ Expo Linking API で処理可能

**問題なし**

---

## 4. 【低】API ルート追加

### 既存のルート

```
/api/register
/api/login
/api/logout
/api/session
/log
/api/logs
/api/log/:id
/api/logs/summary
/api/foods/search
/api/favorites
/api/dashboard
/api/profile
/api/account
/api/iap/purchase
```

### 追加予定のルート

```
/api/referral/invite-link  ✅ 競合なし
/api/referral/claim        ✅ 競合なし
/api/referral/my-status    ✅ 競合なし
/api/user/premium-status   ✅ 競合なし
```

**問題なし**

---

## 5. 【低】認証・セッション管理

### 現状

```typescript
// types/express-session.d.ts
declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}
```

### 必要な変更

なし。既存の `req.session.userId` で認証可能。

**問題なし**

---

## 📋 最終推奨アクション

### 優先度：高

1. **案A（User.plan 廃止）を採用** または **案B（併用）を採用**
   - 推奨は案A（統一管理）
   - ただし、既存ユーザーのマイグレーション計画が必要

2. **マイグレーション計画の作成**（案Aの場合）
   - 既存の `User.plan = STANDARD` を `PremiumGrant` に変換
   - 課金済みユーザーに1年間のPremiumGrant作成

3. **ai-usage-service.ts の修正**
   - プレミアム判定ロジックを `PremiumGrant` ベースに変更

4. **log-cleanup.ts の修正**
   - プレミアムユーザーのログ保存期間を90日に設定

### 優先度：中

5. **クリーンアップジョブのテスト**
   - プレミアム期間終了後のログ削除が正しく動作するか確認

### 優先度：低

6. **ディープリンク動作確認**
   - iOS実機でテスト

---

## 🔄 次のステップ

1. ✅ 現状プロジェクトとの整合性調査完了
2. 🔄 ユーザーに案A/案Bの選択を相談
3. ⏳ 選択された案に基づいて実装計画書を修正
4. ⏳ マイグレーション計画の作成（案Aの場合）
5. ⏳ 実装開始

---

**調査完了日**: 2025-10-23  
**次回アクション**: ユーザーに案A/案Bの判断を仰ぐ
