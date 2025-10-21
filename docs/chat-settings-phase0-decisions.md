# Chat / Dashboard / Settings 拡張 Phase 0 合意事項

## タイムゾーン扱い
- クライアント側で `Intl.DateTimeFormat().resolvedOptions().timeZone` から IANA タイムゾーンを取得する。
- `/log` など食事ログ関連 API へのリクエストでは `timezone` フィールドとして送信し、サーバーは `MealLogPeriodHistory` 等の履歴作成に利用する。
- サーバーでは受信した IANA タイムゾーンをそのままセッションに保存し、未指定時のみ `Asia/Tokyo` をフォールバックとする。

## 法務文書
- プライバシーポリシー: https://meal-log.app/privacy
- 利用規約: https://meal-log.app/terms
- いずれも markdown → 静的配信の最終版を 2025-01-20 付で法務確認済み。

## アカウント削除とデータ保持
- ユーザーからの削除リクエストを受領した時点でアカウント情報・食事ログを即時削除する。
- 監査用バックアップは 30 日間暗号化保管し、自動削除する。復元要求には応じない。

## プロフィール／目標値の取り扱い
- 目標カロリー・PFC・体重・活動レベル・言語設定を `UserProfile` テーブル（今後追加）に保存する。
- 目標値は将来的にダッシュボードやコーチング機能で利用し、現行フェーズでは UI での編集／保存のみ実装する。

## 分析イベント／ログ
- 新規食事登録: `meal.log.created`（属性: `source`, `meal_period`, `timezone`, `has_image`, `favorite_candidate`）。
- 食事編集: `meal.log.updated`（属性: `fields`, `meal_period_changed`）。
- 食事削除/復元: `meal.log.deleted`, `meal.log.restored`。
- 期間フィルター変更: `meal.history.range_changed`（属性: `range`, `has_results`）。
- 設定更新: `settings.updated`（属性: `section`, `fields`）。

