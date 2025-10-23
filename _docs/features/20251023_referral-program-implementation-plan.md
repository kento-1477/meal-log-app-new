# 紹介制度実装計画書

**更新日**: 2025-10-23  
**ステータス**: 設計レビュー完了、実装待ち  
**優先度**: 高  
**推定工数**: 10〜12日（1名想定）

---

## 0. エグゼクティブサマリー

### 目的
有料転換率を最優先で向上させ、持続可能なユーザー獲得を実現する。

### リワード設計（最終確定版）
- **友だち（被紹介者）**: 登録時に即時**14日間**プレミアム付与
- **紹介者**: 友だちが**3日連続ログ達成**で**30日間**プレミアム付与（人数無制限）
- **表現**: 「友だち1人で30日延長」（「最大30日」という曖昧な表現は使わない）
- **プレミアム特典**: 
  - 月間カロリー差分表示
  - **過去90日の履歴保存**（無料ユーザーは30日のみ）

### KPI
- **主要**: 30日以内の有料化率（紹介経由）
- **次点**: K係数（目標**≥0.5**、成熟期0.8〜1.0）、新規登録数

### スコープ
- **Phase 1**: iOS先行、基本機能実装（アプリインストール済みユーザー間）
- **Phase 2**: 不正検知強化、Analytics統合
- **Phase 3**: Android対応、Universal Links対応（未インストール経路）

---

## 1. データベース設計

### 1.1 新規テーブル作成

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
  completedAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([referrerUserId])
  @@index([status])
}

enum ReferralStatus {
  PENDING      // 友だち登録済み、3日連続未達成
  COMPLETED    // 3日連続達成、紹介者にプレミアム付与済み
  EXPIRED      // 30日経過しても未達成
  FRAUD        // 不正と判定
}
```

- [ ] Prismaスキーマに `Referral` モデルを追加
- [ ] `ReferralStatus` enum を追加
- [ ] `User` モデルに関連を追加（`referralsMade`, `referredBy`）
- [ ] マイグレーションファイル作成
- [ ] マイグレーション実行（dev, staging, prod）

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
  REFERRAL_FRIEND    // 友だちとして招待された
  REFERRAL_REFERRER  // 紹介者として獲得
  PURCHASE           // 課金購入
  ADMIN_GRANT        // 管理者付与
}
```

- [ ] Prismaスキーマに `PremiumGrant` モデルを追加
- [ ] `PremiumSource` enum を追加
- [ ] `User`, `Referral`, `IapReceipt` との関連を設定
- [ ] マイグレーションファイル作成
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

- [ ] Prismaスキーマに `ReferralInviteLink` モデルを追加
- [ ] `User` との関連を設定
- [ ] マイグレーションファイル作成
- [ ] マイグレーション実行

### 1.2 既存テーブル修正

#### ✅ チェックリスト: `User` モデル拡張

- [ ] `User` に `referralsMade` リレーション追加（1対多、Referralへ）
- [ ] `User` に `referredBy` リレーション追加（1対1、Referralへ）
- [ ] `User` に `premiumGrants` リレーション追加（1対多、PremiumGrantへ）
- [ ] `User` に `inviteLinks` リレーション追加（1対多、ReferralInviteLinkへ）
- [ ] マイグレーション実行

---

## 2. バックエンドAPI設計

### 2.1 招待リンク生成API

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
  "code": "A3K9Px"
}
```

**実装タスク**:
- [ ] `/api/referral/invite-link` ルート作成
- [ ] ユーザーごとに一意の短縮コード生成（6文字、A-Za-z0-9）
- [ ] `ReferralInviteLink` テーブルに保存（既存なら再利用）
- [ ] ディープリンク + Webランディングページ両方のURLを返却
- [ ] 認証必須（セッションチェック）
- [ ] レスポンスに「友だち1人で30日延長」というメッセージを含める

### 2.2 招待コード検証・紐付けAPI

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
- [ ] `/api/referral/claim` ルート作成
- [ ] 招待コードの存在確認
- [ ] 重複防止チェック（同一ユーザーが複数回使用不可）
- [ ] `Referral` レコード作成（status: PENDING）
- [ ] 友だちに14日プレミアム付与（`PremiumGrant` 作成）
- [ ] `ReferralInviteLink` の `signupCount` をインクリメント
- [ ] 認証必須

### 2.3 プレミアム状態取得API

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
- [ ] `/api/user/premium-status` ルート作成
- [ ] ユーザーの全 `PremiumGrant` を取得
- [ ] 現在有効なプレミアム期間を計算（最も遅い `endDate` を採用）
- [ ] `isPremium` フラグを返却（現在日時 < endDate）
- [ ] 認証必須

### 2.4 紹介状況取得API

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
    "totalPremiumDaysEarned": 42
  },
  "recentReferrals": [
    {
      "friendUsername": "HanakoSato",
      "status": "COMPLETED",
      "consecutiveDays": 3,
      "createdAt": "2025-10-20T10:00:00Z",
      "completedAt": "2025-10-23T10:00:00Z"
    },
    {
      "friendUsername": "User_1234",
      "status": "PENDING",
      "consecutiveDays": 1,
      "createdAt": "2025-10-22T15:00:00Z",
      "completedAt": null
    }
  ]
}
```

**実装タスク**:
- [ ] `/api/referral/my-status` ルート作成
- [ ] ユーザーの招待コードを取得
- [ ] ユーザーの全 `Referral` を取得（referrerUserId）
- [ ] 統計情報を計算（total, completed, pending, days earned）
- [ ] 最新5件の紹介状況を返却
- [ ] 認証必須

### 2.5 3日連続ログチェックジョブ

#### ✅ バッチジョブ: `check-referral-completion`

**実行頻度**: 1日1回（午前3時 JST）

**処理内容**:
1. `Referral` テーブルから `status = PENDING` のレコードを全取得
2. 各レコードについて、被紹介者（referredUser）の `MealLog` を確認
3. 直近3日間に連続してログがあるか判定
   - タイムゾーンを考慮（`UserProfile.language` から推測 or デフォルト Asia/Tokyo）
   - 各日に1件以上の有効ログ（deletedAt IS NULL, zeroFloored = false）
4. 達成していれば:
   - `Referral.status` を `COMPLETED` に更新
   - `Referral.consecutiveDaysAchieved` を 3 に設定
   - `Referral.completedAt` を現在時刻に設定
   - 紹介者に**30日**プレミアム付与（`PremiumGrant` 作成）
   - `Referral.referrerPremiumGranted` を true に設定
5. 30日経過しても未達成なら:
   - `Referral.status` を `EXPIRED` に更新

**実装タスク**:
- [ ] `apps/server/src/jobs/check-referral-completion.ts` 作成
- [ ] 3日連続ログ判定ロジック実装（タイムゾーン考慮）
- [ ] プレミアム付与処理を抽象化（`PremiumGrantService.grantDays()`）
- [ ] 30日期限切れチェック実装
- [ ] Cron設定（package.jsonにスクリプト追加）
- [ ] ログ出力（Pino）

---

## 3. フロントエンド（Mobile）実装

### 3.1 招待リンク生成・共有機能

#### ✅ 実装箇所: `apps/mobile/app/(tabs)/settings.tsx`

**変更内容**:
- [ ] `handleInvite` 関数を実装
  - API `/api/referral/invite-link` を呼び出し
  - 招待リンクを取得
  - `Share.share()` で共有メニューを表示
    - タイトル: 「Meal Logを一緒に使いませんか？」
    - メッセージ: 「紹介リンクから登録すると14日間プレミアム無料！友だちを紹介すると30日延長も！ {inviteLink}」
- [ ] 共有チャネルボタン追加（**LINEをプライマリ**、他をセカンダリ）
  - **LINE**: `line://msg/text/{message}` - **大きく目立つボタン**
  - Instagram: DM不可、ストーリー投稿のみ（`instagram://story-camera`）- 小さめボタン
  - X: `twitter://post?message={message}` - 小さめボタン
  - WhatsApp: `whatsapp://send?text={message}` - 小さめボタン
- [ ] エラーハンドリング（ネットワークエラー、APIエラー）
- [ ] ローディング状態表示

#### ✅ 翻訳追加: `apps/mobile/src/i18n/index.ts`

- [ ] `referral.share.title`: 「Meal Logを一緒に使いませんか？」
- [ ] `referral.share.message`: 「このリンクから登録すると14日間プレミアム無料！友だちを紹介すると30日延長も！ {{link}}」
- [ ] `referral.invite.rewardText`: 「友だち1人で30日延長」
- [ ] `referral.friend.rewardText`: 「紹介なら14日間プレミアム無料」
- [ ] `referral.error.loadFailed`: 「招待リンクの取得に失敗しました」
- [ ] `referral.error.shareFailed`: 「共有に失敗しました」
- [ ] 英語版も追加

### 3.2 ディープリンク受信・処理

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

### 3.3 紹介状況画面

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

### 3.4 プレミアムバッジ・残日数表示

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

## 4. プレミアム特典実装

### 4.1 月間カロリー差分表示（既存機能の制限追加）

- [x] 既に実装済み（`dashboard.tsx`）
- [ ] プレミアム会員のみ表示するように条件分岐追加
- [ ] 無料ユーザーには鍵アイコン + 「プレミアム限定」表示
- [ ] ペイウォールタップ時に紹介プログラム画面へ誘導

### 4.2 履歴90日保存（新機能・プレミアム特典）

#### ✅ 実装内容

**バックエンド**:
- [ ] `GET /api/logs` に期間フィルタロジック追加
  - 無料ユーザー: 過去**30日**のみ返却
  - プレミアムユーザー: 過去**90日**を返却
  - プレミアム判定は `PremiumGrant` テーブルを参照
- [ ] クリーンアップジョブ修正（`log-cleanup.ts`）
  - 無料ユーザーのログは30日以降削除（既存）
  - プレミアムユーザーのログは90日以降削除（新規）
  - プレミアム期間が終了したユーザーは30日ルールに戻る

**フロントエンド**:
- [ ] 履歴画面に期間選択追加（「1か月」「3か月」）
- [ ] 無料ユーザーには「3か月」オプションを非表示
- [ ] プレミアム誘導メッセージ表示（「90日履歴を見るには友だちを招待してプレミアムへ！」）
- [ ] 誘導ボタンタップ時に紹介プログラム画面へ遷移

---

## 5. 不正検知・セキュリティ

### 5.1 重複防止

#### ✅ チェック項目

- [ ] メールアドレス重複チェック（既存ユーザー検出）
- [ ] 同一ユーザーが複数の招待コードを使用できないようにする
  - `Referral.referredUserId` は UNIQUE 制約
- [ ] 自己紹介防止（referrerUserId ≠ referredUserId）
- [ ] IPアドレス + User-Agentのハッシュを記録（簡易デバイス指紋）
  - `Referral` テーブルに `deviceFingerprint` カラム追加
  - 同一fingerprintで複数アカウント作成を検知
- [ ] 短期間での大量紹介を検知（1時間に10人以上 = 疑わしい）
  - 管理者通知（メール or Slack）

**実装タスク**:
- [ ] `/api/referral/claim` に重複チェックロジック追加
- [ ] IPアドレス取得（`req.ip`）
- [ ] User-Agent取得（`req.headers['user-agent']`）
- [ ] デバイス指紋生成（SHA256ハッシュ）
- [ ] 大量紹介検知アラート実装

### 5.2 不正パターン検知

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

## 6. Analytics & KPI計測

### 6.1 イベントトラッキング

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

### 6.2 KPIダッシュボード（管理者用）

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

## 7. テスト計画

### 7.1 ユニットテスト

- [ ] `ReferralService.createInviteLink()` テスト
- [ ] `ReferralService.claimReferral()` テスト（重複防止）
- [ ] `PremiumGrantService.grantDays()` テスト（期間計算）
- [ ] `ReferralService.checkConsecutiveDays()` テスト（3日連続判定）
- [ ] デバイス指紋生成テスト

### 7.2 統合テスト

- [ ] エンドツーエンド: 招待リンク生成 → 友だち登録 → プレミアム付与
- [ ] エンドツーエンド: 3日連続ログ → 紹介者プレミアム付与
- [ ] 重複防止: 同一ユーザーが複数回使用できないことを確認
- [ ] 自己紹介防止: 自分自身を紹介できないことを確認
- [ ] 期限切れ: 30日経過後にEXPIREDになることを確認

### 7.3 手動テスト

- [ ] iOS実機でディープリンク動作確認
- [ ] 共有メニュー動作確認（LINE, X, WhatsApp）
- [ ] プレミアムバッジ表示確認
- [ ] 紹介状況画面の表示確認
- [ ] エラーハンドリング確認（ネットワークエラー、不正コード）

---

## 8. デプロイ計画

### 8.1 Phase 1: 基本機能（優先度: 高）

**実装範囲**:
- DB設計・マイグレーション
- バックエンドAPI（招待リンク生成、claim、プレミアム状態取得）
- フロントエンド（招待リンク生成・共有、ディープリンク受信）
- 3日連続チェックジョブ
- プレミアムバッジ表示

**推定工数**: 7日

**リリース判定基準**:
- [ ] 全ユニットテストパス
- [ ] 全統合テストパス
- [ ] iOS実機で手動テスト完了
- [ ] ステージング環境でE2Eテスト完了

### 8.2 Phase 2: 不正検知・Analytics（優先度: 中）

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

### 8.3 Phase 3: Android対応・Universal Links（優先度: 低）

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

## 9. リスク管理

### 9.1 高リスク項目

| リスク | 影響 | 緩和策 | 担当 |
|--------|------|--------|------|
| 不正ユーザーの大量発生 | 高 | デバイス指紋、管理者通知、手動レビュー | Backend |
| ディープリンクが動作しない | 中 | フォールバック（手動コード入力） | Mobile |
| プレミアム期間の計算ミス | 高 | ユニットテスト徹底、手動検証 | Backend |
| iOS審査で紹介制度が却下 | 高 | App Store審査ガイドライン確認（3.2.2） | PM |

### 9.2 ロールバック計画

- [ ] Phase 1リリース後、1週間は機能フラグでON/OFF切り替え可能にする
- [ ] 緊急時はフロントエンドで招待カードを非表示にする
- [ ] DBテーブルは残し、ロジックのみ無効化

---

## 10. 成功指標・モニタリング

### 10.1 初期目標（リリース後30日）

- [ ] K係数 ≥ **0.3**（初期フェーズ）
- [ ] 紹介経由サインアップ数 ≥ 100人
- [ ] 3日連続達成率 ≥ 40%
- [ ] 30日以内有料化率 ≥ 10%（紹介経由）

### 10.2 中期目標（リリース後90日）

- [ ] K係数 ≥ **0.5**（主要KPI）
- [ ] 紹介経由サインアップ数 ≥ 500人
- [ ] 3日連続達成率 ≥ 50%
- [ ] 30日以内有料化率 ≥ 15%（紹介経由）
- [ ] プレミアム継続率（紹介経由） ≥ 30%（プレミアム期間終了後に課金）

### 10.3 アラート設定

- [ ] 不正検知数が1日10件を超えたらSlack通知
- [ ] 3日連続達成率が20%を下回ったらアラート（設計見直し）
- [ ] K係数が0.2を下回ったらアラート（プロモーション強化）

---

## 11. 未解決事項・今後の検討

- [ ] Android版の優先順位を再検討（ユーザーからの要望次第）
- [ ] プレミアム特典の追加検討（AI翻訳無制限、エクスポート機能など）
- [ ] 紹介ランキング機能（上位10名にボーナス）
- [ ] 法務レビュー（利用規約に紹介制度の記載追加）
- [ ] LINEでの共有体験を最適化（OGP画像、メタデータ）

---

## 12. 関連ドキュメント

- `_docs/thinking/20251023_referral-program-review.md`: マーケティング観点のレビュー
- `_docs/specs/api-referral.md`: APIエンドポイント仕様（作成予定）
- `README.md`: 環境構築手順
- `Agent.md`: 開発プロトコル

---

**最終更新**: 2025-10-23  
**次回レビュー**: Phase 1実装完了後（推定11月上旬）
