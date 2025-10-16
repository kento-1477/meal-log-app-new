# 機能実装計画

## 前提更新

- 共有: 汎用シェアシートを採用（LINE/WhatsApp 固有フォーマット対応は不要）
- エクスポート: 日/週/月の期間をユーザーが選択可能
- 100クレ購入: アプリ内課金 (IAP) で実装
- よく食べるセット: ユーザーごとの私有データとして同期/API 対応
- 履歴削除: 完全削除（バックアップや管理者閲覧なし）
- ウィジェット: iPhone 15〜17 を対象。数ヶ月以内の提供を目標に、工数が軽微なら実装まで進める

## 食事記録共有・エクスポート

- [x] Backend: `log-share-service` 新設、共有テキスト生成 + CSV/PDF 出力 / 期間指定（日/週/月）対応 API 追加
- [x] Backend: `LogShareToken`（有効期限含む）テーブル追加と共有リンク検証・監査ログ実装
- [x] Mobile-Chat: `NutritionCard` 周辺へ共有ボタン追加し、汎用 `Share.share` でテキスト/リンク送信
- [x] Mobile-履歴: `RecentLogsList` と 個別ログ詳細に共有/エクスポート CTA を配置
- [x] Mobile-エクスポートUI: 期間選択（日/週/月）UI + `expo-file-system` / `expo-print` + `expo-sharing` で CSV/PDF 出力（実機 Expo Go 環境では共有機能の制限により保留）
- [x] QA: サーバーの CSV/PDF フォーマット・認可テスト、モバイルの share util 単体テスト、手動確認シナリオ記録

## ホームウィジェット（iOS）

- [x] 調査: Expo 54 + iOS 15-17 での Widget 実装手段を調査し、構成メモを作成（`docs/ios-widget-research.md`）
- [x] Backend: 連続記録日数 API (`/api/streak`) 追加、日数計算ロジック共通化
- [x] Mobile: Widget 用データ共有（AsyncStorage or WidgetKit shared storage）設計と streak 表示プロトタイプを実装（Dashboard で streak バッジ表示＋キャッシュ）
- [ ] Mobile: 工数が軽微なら実装（Widget Extension / config plugin 作成、火アイコン＋連続日数表示）
- [ ] QA: iOS 15/16/17 それぞれで表示確認手順を準備、未ログ時の fallback 仕様決定

## AI 利用回数制限 (無料:3回/日, 有料:20回/日, 画像含む)

- [x] Backend: `UserPlan` enum + `AiUsageCounter` テーブル追加、`processMealLog` で日次カウント＆拒否処理
- [x] Backend: 課金プラン情報をセッションに格納し、レスポンスへ残回数を含める
- [x] Mobile: Chat ストアに残回数状態を追加し、送信前チェック／残回数表示／利用不可時の送信阻止
- [ ] IAP: 100クレ購入フロー実装（プラットフォーム別 IAP 設定、レシート検証シーケンス整備）※ App Store Connect 等の非コード作業が必要なため、現状は保留
- [ ] QA: 429/422 応答テスト、日次リセット・プラン切替・IAP 後のカウント更新テスト

## よく食べるセット（私有）

- [ ] Backend: `FavoriteMeal`/`FavoriteMealItem` テーブル + CRUD API (`/api/favorites`) 実装
- [ ] Backend: `processMealLog` 結果からお気に入り登録用サマリを生成可能にするユーティリティ追加
- [ ] Mobile: Chat composer に「お気に入り呼び出し」、履歴カードに登録トグルを追加
- [ ] Mobile: お気に入り管理画面 (`app/favorites/[id].tsx`) 作成、手入力・既存ログ複製両対応
- [ ] QA: Prisma migration / seed 更新、API 契約テスト、React Query キャッシュ確認

## 履歴削除（無料30日制限）

- [ ] Backend: `MealLog.deletedAt` 追加、`DELETE /api/log/:id` API でソフトデリート処理
- [ ] Backend: 日次ジョブで無料ユーザーの30日超ログを完全削除（バッチスクリプト or Cron）
- [ ] Mobile: 履歴リスト・詳細画面に削除ボタン + 確認ダイアログ・Undo ポリシーを実装
- [ ] UX: 削除後の表示（即時リスト反映・トースト等）を定義
- [ ] QA: 削除 API とクリーンアップジョブのテスト、有料プラン無制限の回帰確認

## 上限/31日目ダイアログ

- [ ] i18n: 文言を辞書へ追加し、残回数/料金/区分をテンプレ化
- [ ] Chat: 無料枠到達でモーダル表示し、`Standard` プラン / IAP 導線切替
- [ ] 31日目: 連続記録開始から30日経過を検知し、履歴チャネルでモーダル表示 + プラン誘導
- [ ] State: ダイアログ表示履歴を AsyncStorage に保存（同日再表示防止）
- [ ] QA: RN Testing Library で表示ロジック単体テスト、手動テストシナリオ整備

## UI 日本語化

- [ ] コード全体を走査し、ハードコード英語ラベルを `t()` 呼び出しへ置換
- [ ] `src/i18n` 辞書を拡充（Confidence、kcal、Macroラベルなど網羅）
- [ ] サーバー側ラベル（Dashboard builder 等）も日本語へ統一、英語fallback を維持
- [ ] QA: 画面レビュー／スクリーンショット比較、locale fallback テスト追加

## 言語切替の将来拡張

- [ ] Locale 永続化（AsyncStorage）と `useTranslation` のグローバル設定拡張
- [ ] 設定画面に言語切替 UI 追加、即時反映を確認
- [ ] 共有/エクスポート文言が locale で切り替わるよう server/mobile 双方調整
- [ ] ドキュメントへ運用手順追加、locale 切替テスト整備

## 次ステップ

1. 共有/エクスポートと AI 制限の詳細仕様（画面モック・API スキーマ）を固め、Prisma migration 設計を開始
2. IAP フロー・Widget 技術調査を優先実施し、工数見積りを更新
3. 機能ごとのタスクチケットを作成し、サーバー → モバイル → QA の順で進める計画を策定
