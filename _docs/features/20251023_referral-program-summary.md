# 紹介制度 - 確定仕様サマリー

**更新日**: 2025-10-23  
**ステータス**: 最終確定、実装準備完了  

---

## 📋 確定仕様（最終版）

### リワード設計

| 対象 | 条件 | 報酬 | 備考 |
|------|------|------|------|
| **友だち（被紹介者）** | 登録完了時 | **14日間**プレミアム | 即時付与 |
| **紹介者** | 友だちが3日連続ログ達成 | **30日間**プレミアム | 人数無制限 |

**表現**: 「友だち1人で30日延長」（「最大」という曖昧な表現は使わない）

### プレミアム特典

1. **月間カロリー差分表示**（既存機能をプレミアム限定化）
2. **過去90日の履歴保存**（無料ユーザーは30日のみ）

### KPI目標

| 期間 | K係数 | 紹介経由サインアップ | 3日連続達成率 | 30日以内有料化率 |
|------|-------|---------------------|--------------|-----------------|
| **初期（〜30日）** | ≥ 0.3 | ≥ 100人 | ≥ 40% | ≥ 10% |
| **中期（〜90日）** | **≥ 0.5** | ≥ 500人 | ≥ 50% | ≥ 15% |

### スコープ

- **Phase 1**: iOS先行、基本機能（アプリインストール済みユーザー間）
- **Phase 2**: 不正検知強化、Analytics統合
- **Phase 3**: Android対応、Universal Links対応

---

## 🎨 UI/UX設計

### 共有チャネルの優先順位

1. **LINE（プライマリ）**: 大きく目立つボタン
2. Instagram / X / WhatsApp（セカンダリ）: 小さめボタン

**理由**: 日本市場ではLINEが圧倒的に強いため、最優先で配置

### メッセージテンプレート

**日本語**:
```
Meal Logを一緒に使いませんか？
このリンクから登録すると14日間プレミアム無料！
友だちを紹介すると30日延長も！
{inviteLink}
```

**英語**:
```
Join me on Meal Log!
Sign up with this link to get 14 days of premium free!
Refer friends to earn 30 more days!
{inviteLink}
```

---

## 🔧 技術実装の重要ポイント

### 1. プレミアム判定ロジック

```typescript
// PremiumGrantService.ts
function isPremium(userId: number): boolean {
  const grants = await prisma.premiumGrant.findMany({
    where: { 
      userId, 
      endDate: { gte: new Date() } 
    },
    orderBy: { endDate: 'desc' }
  });
  return grants.length > 0;
}

function getPremiumUntil(userId: number): Date | null {
  const grants = await prisma.premiumGrant.findMany({
    where: { 
      userId, 
      endDate: { gte: new Date() } 
    },
    orderBy: { endDate: 'desc' }
  });
  return grants[0]?.endDate ?? null;
}
```

### 2. 3日連続ログ判定

```typescript
// ReferralService.ts
async function checkConsecutiveDays(userId: number): Promise<number> {
  const logs = await prisma.mealLog.findMany({
    where: { 
      userId,
      deletedAt: null,
      zeroFloored: false
    },
    orderBy: { createdAt: 'desc' },
    take: 50 // 直近50件で判定
  });

  let consecutiveDays = 0;
  let lastDate: Date | null = null;

  for (const log of logs) {
    const logDate = DateTime.fromJSDate(log.createdAt).startOf('day');
    
    if (!lastDate) {
      lastDate = logDate;
      consecutiveDays = 1;
      continue;
    }

    const diff = lastDate.diff(logDate, 'days').days;
    
    if (diff === 1) {
      consecutiveDays++;
      lastDate = logDate;
      if (consecutiveDays >= 3) break;
    } else if (diff > 1) {
      break; // 途切れた
    }
  }

  return consecutiveDays;
}
```

### 3. 重複防止ロジック

```typescript
// ReferralService.ts
async function claimReferral(userId: number, code: string): Promise<void> {
  // 1. 既に紹介コードを使用済みか確認
  const existingReferral = await prisma.referral.findUnique({
    where: { referredUserId: userId }
  });
  if (existingReferral) {
    throw new Error('既に招待コードを使用しています');
  }

  // 2. 招待コードの存在確認
  const inviteLink = await prisma.referralInviteLink.findUnique({
    where: { code }
  });
  if (!inviteLink) {
    throw new Error('無効な招待コードです');
  }

  // 3. 自己紹介防止
  if (inviteLink.userId === userId) {
    throw new Error('自分自身を招待することはできません');
  }

  // 4. デバイス指紋チェック（簡易版）
  const fingerprint = generateDeviceFingerprint(req);
  const recentReferrals = await prisma.referral.findMany({
    where: {
      deviceFingerprint: fingerprint,
      createdAt: { gte: DateTime.now().minus({ days: 7 }).toJSDate() }
    }
  });
  if (recentReferrals.length >= 3) {
    // 疑わしいパターン: 同一デバイスから1週間で3回以上
    await notifyAdmin('Suspicious referral pattern detected', { userId, fingerprint });
  }

  // 5. Referralレコード作成 + 友だちにプレミアム付与
  // ...
}
```

---

## 📊 モニタリング計画

### ダッシュボードに表示する指標

1. **K係数**: `紹介人数 / アクティブユーザー数`
2. **紹介経由サインアップ数**: 日次/週次/月次
3. **3日連続達成率**: `COMPLETED / (COMPLETED + PENDING + EXPIRED)`
4. **30日以内有料化率**: 紹介経由ユーザーが30日以内に課金した割合
5. **プレミアム継続率**: プレミアム期間終了後に課金した割合
6. **不正検知数**: `FRAUD` ステータスの件数

### アラート設定

| 条件 | アクション |
|------|-----------|
| 不正検知数 > 10件/日 | Slack通知 |
| K係数 < 0.2 | アラート（プロモーション強化） |
| 3日連続達成率 < 20% | アラート（設計見直し） |

---

## ✅ レビュー時の変更履歴

| 項目 | 初期提案 | 最終決定 | 理由 |
|------|---------|---------|------|
| 紹介者リワード | 21日 | **30日** | 紹介インセンティブを最大化 |
| K係数目標 | 1.0 | **0.5** | 現実的な目標値に調整 |
| リワード表現 | 「最大30日」 | **「友だち1人で30日延長」** | 明確で誤解のない表現 |
| プレミアム特典 | 月間カロリー差分のみ | **+ 履歴90日保存** | 差別化強化 |
| 共有チャネル | 並列 | **LINEをプライマリ** | 日本市場の特性を考慮 |

---

## 📁 関連ドキュメント

- **レビュー**: `_docs/thinking/20251023_referral-program-review.md`
- **実装計画書**: `_docs/features/20251023_referral-program-implementation-plan.md`
- **API仕様**: `_docs/specs/api-referral.md`（作成予定）

---

**最終確認日**: 2025-10-23  
**承認者**: ユーザー  
**実装開始予定**: 2025-10-24
