# プレミアム課金導線・画面実装計画（Draft）

## 1. 背景と現状整理
- ダッシュボードのロック表示から `/paywall` に遷移するようにしたが、該当画面が未実装。
- 既存のアップセル導線（履歴タブや利用上限モーダルなど）は紹介プログラムへ誘導したままで、課金導線と整合していない。
- IAP バックエンド（`processIapPurchase`）は存在するが、クライアント側 UI／購入フローが存在しない。
- 現在の IAP レスポンスはクレジット付与情報のみで Premium 状態を返しておらず、PremiumStore へ反映できない。
- プレミアムへのアップグレード手段が無いため、現在のままではリリース不可。

## 2. 実装目標（MVP）
- iOS アプリ内課金を開始できる「プレミアム購入画面（Paywall）」を実装。
- 無料ユーザー向けのアップセル導線を課金画面へ統一。
- 課金完了後、PremiumGrant と AI 利用上限が即時反映されることを確認。
- エラー／キャンセル時はユーザーに再試行案内を表示。

---

## 3. 実装タスク一覧（チェックリスト）

### 3.1 新規 Paywall 画面作成
- [x] `apps/mobile/app/paywall.tsx`（仮名）を作成し、`expo-router` へ登録。
- [x] 料金プラン説明・特典一覧・復元／購入ボタン UI を実装。
- [x] `expo-in-app-purchases` から取得したプロダクト情報（タイトル／価格／通貨）を表示するためのフェッチロジックを追加し、画面ロード時に `getProductsAsync` を呼び出す。
- [x] `purchaseCreditPack` を再利用／リファクタリングした `purchasePremiumPlan` の `useMutation` を用意。
- [x] 進捗インジケータ／キャンセルハンドリングを実装。
- [x] 成功時：`PremiumStore`/`SessionStore` を更新し、ダッシュボードへ戻す。
- [x] 失敗／キャンセル時：エラーバナー＋再試行アラートを表示。
- [x] 既に Premium のユーザーがアクセスした際はステータスメッセージを表示し、購入ボタンを無効化する。

### 3.2 既存アップセル導線の更新
- [x] ダッシュボードのロックカード遷移先を `/paywall` に統一。
- [x] ダッシュボードの文言を課金誘導向けに更新。
- [x] 履歴タブ (`RecentLogsList`) のアップセルボタン遷移先を `/paywall` へ変更。
- [x] AI 利用上限モーダル (`usage.limitModal`, `usage.streakModal`) のボタンも `/paywall` へ。
- [x] 紹介プログラム文言が残っている箇所を点検・置換。
- [x] **設定タブのカード**は、アプリ拡散（紹介プログラム）を最優先とするプロダクト方針に基づき `/referral-status` への導線を維持（`apps/mobile/app/(tabs)/settings.tsx` 更新、`_docs/features/20251023_referral-program-implementation-plan-v2.md` 反映）。

### 3.3 購入ロジック＆ストア更新
- [x] `services/api.ts` にプレミアム購入 API 呼び出しを追加（既存 `/api/iap/purchase` を利用）。
- [x] サーバーの `/api/iap/purchase` レスポンスに Premium 状態（`isPremium`, `daysRemaining`, `grants` など）を含めるよう変更し、`@meal-log/shared` のスキーマを更新。
- [x] 新しいレスポンスを用いて `PremiumStore` と `SessionStore` を即時更新。
- [x] エラーコード（`iap.cancelled`, `AI_USAGE_LIMIT`, ネットワーク失敗など）をハンドリング。
- [x] `purchaseCreditPack` から切り出した共通 IAP ヘルパーを `purchasePremiumPlan` と共有し、未処理トランザクションの再処理を考慮。

### 3.4 バックエンド確認（必要時）
- [x] `/api/iap/purchase` が PremiumGrant を 365 日付与する仕様を再確認。
- [x] Premium プロダクトではクレジットを加算しない（または 0 を許容する）分岐を追加し、`resolveCreditsForProduct` に該当 Product ID を登録。
- [x] Premium 状態をレスポンスに含めるための `processIapPurchase` の戻り値とシリアライザを更新し、既存クライアントへの影響を評価。
- [x] `.env` の `IAP_TEST_MODE`, `APP_STORE_SHARED_SECRET` をサンプル・ローカル設定に追加（`.env.example`, `.env.local`, `apps/server/.env.local`）。
- [x] サンドボックス用 Product ID を `packages/shared/src/index.ts` の定数に登録 (`com.meallog.premium.annual`, `com.meallog.credits.100`) ＋ README/Agent.md に利用手順を追記。Apple ID はチーム共有のサンドボックスアカウントを利用する想定（要 App Store Connect 管理）。

### 3.5 ナビゲーション・ガード
- [x] `apps/mobile/app/_layout.tsx` に Paywall 画面の Stack エントリを追加。
- [x] 無料ユーザーのみ遷移できるようガード（ログインチェック + `isPremium`）。
- [x] 紹介プログラム画面と役割が被る場合は導線を整理。

### 3.6 復元フロー実装
- [x] `InAppPurchases.restorePurchasesAsync` を実行する復元ボタンの `useMutation` を実装。
- [x] 復元結果から Premium プロダクトを判定し、必要に応じてサーバーへ `submitIapPurchase` を再送。
- [x] 復元成功／失敗時の UI とトーストを実装。
- [x] 未完了トランザクションがある場合の再処理ロジックを整理。

### 3.7 翻訳・文言
- [x] Paywall 画面用文言（日英）を `apps/mobile/src/i18n/index.ts` に追加。
- [x] 既存の紹介プログラム誘導の文言を課金導線向けに修正。
- [x] エラーメッセージ（ネットワーク／ストア未対応等）、復元完了／失敗などの翻訳を追加。

### 3.8 （任意）アナリティクス
- [x] `analytics/events.ts` に paywall 表示／購入成功／キャンセル／失敗／復元成功イベントを追加。
- [x] 画面内で `trackEvent` を呼び出す（`apps/mobile/app/paywall.tsx`）。

---

## 4. テスト計画

### 4.1 単体テスト
- [x] `purchasePremiumPlan` の成功／失敗パスを Jest でモックテスト。
- [x] `PremiumStore` 更新ロジックのテスト。
- [x] 復元処理が Premium 状態を再同期することを検証するユニットテスト。

### 4.2 手動テスト
- [x] 無料ユーザーで Paywall を開き UI と導線を確認（iPhone 16 シミュレータ／`demo@example.com`）。
- [x] サンドボックス購入でプレミアムが付与されるか検証（`IAP_TEST_MODE=true` でテストレシートを送付、バックエンドが PremiumGrant を付与することを確認）。
- [x] 購入キャンセル／ネットワーク失敗時の動作を確認（`iap.cancelled`, `iap.error` を強制して Alert 表示とエラートラッキングを確認）。
- [x] 購入後にダッシュボード／履歴のロックが解除されることを確認（Store 更新後ダッシュボード復帰でロックが非表示）。
- [x] 既に PremiumGrant を持つユーザーで Paywall を開いた場合の表示を確認（Premium バッジとボタン無効化を確認）。
- [x] 復元ボタンからサンドボックス購入を復元し、Premium 状態と AI クレジットが矛盾しないことを確認（テストレシート再送で PremiumStore/SessionStore が同期されることを確認）。

> テスト記録: `_docs/features/20251102_paywall-test-log.md`（2025-03-29 iPhone 16 Simulator, IAP test receipts）に詳細を残しています。

### 4.3 自動テスト（優先度: 中）
- [x] `apps/server/tests/integration` に IAP 成功テストを追加（`iap.test.ts`）。
- [x] 既存テスト（ログ取得等）が PremiumGrant 確認込みで通ることを確認（`npm run test:integration --workspace apps/server` で実行）。
- [x] Premium プロダクト（クレジット 0）のパスが正常に処理される統合テストを追加（上記テストで検証）。

---

## 5. 依存関係・準備物
- App Store Connect のサブスクリプション／非消費型アイテム登録。
- `.env.local` に IAP 関連設定（`APP_STORE_SHARED_SECRET`, `IAP_TEST_MODE` 等）。
- サンドボックス購入確認用 Apple ID。
- `resolveCreditsForProduct` にプレミアム商品の Product ID と付与日数マッピングを追加。
- Premium 状態を返すための API 契約変更をバックエンド／クライアント双方で合意。

---

## 6. スケジュール目安
| フェーズ | 作業 | 工数目安 |
| --- | --- | --- |
| 1 | Paywall UI + 翻訳 | 0.5日 |
| 2 | 購入ロジック実装 | 1日 |
| 3 | 導線統一（各画面） | 0.5日 |
| 4 | テスト（サンドボックス） | 1日 |
| 5 | ドキュメント更新 | 0.5日 |
| **合計** |  | **約3.5日** |

---

## 7. リスクと対応
- **App Store 設定漏れ** → Product ID/Shared Secret/サンドボックスユーザーを事前確認。
- **購入失敗時の案内不足** → Paywall 内で具体的なエラーメッセージと再試行手順を提示。
- **UI 審査リジェクト** → ロック表示を明示し、App Review ガイドライン 3.2.1/3.2.2 を遵守。

---

## 8. ドキュメント更新
- [x] `_docs/features/20251023_referral-program-implementation-plan-v2.md` に課金導線・設定カードの扱いを追記。
- [x] `README` / `Agent.md` にサンドボックス購入手順と IAP 関連の環境変数を追記。
- [x] ヘルプ文言：現状 Helpline は未公開のため追加更新は不要と記録。

---

## 9. 完了定義
- [x] 無料ユーザーが Paywall から課金を完了し、プレミアムが即時反映される（IAP テストレシートで確認）。
- [x] 復元ボタンからサンドボックス購入を復元しても Premium 状態が反映される。
- [x] すべてのロック表示が Paywall に誘導される（設定カードを除き、企画方針に従って紹介導線を維持）。
- [x] 導線・文言が最新仕様に揃っている。
- [x] iOS シミュレータ + サンドボックスで課金フロー・復元フロー検証済み（実機ではサンドボックス Apple ID を使用する）。
- [x] 必要なログやアナリティクスイベントが発火している（`analytics/events.ts` に paywall 系イベントを追加し、画面で送信）。
