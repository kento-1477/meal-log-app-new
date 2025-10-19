# AI Translation Backfill Procedure

この手順では、既存の `MealLog.aiRaw` レコードに新しい `translations` 構造と日本語訳を追加する方法をまとめます。

## 1. Prisma Migration 適用

1. `apps/server/prisma/migrations/20251201000000_add_ai_translations/migration.sql` を適用すると、既存の `aiRaw` に以下の変更が入ります。
   - `locale: "en-US"` を設定
   - `translations.en-US` に現在の `aiRaw` をコピー（既に `translations` が存在する場合はスキップ）
2. 本番 or ステージング DB に対して次を実行してください。

   ```bash
   cd apps/server
   npx prisma migrate deploy
   ```

## 2. バッチスクリプトで翻訳を追加

- 既存ログに日本語訳を追加するスクリプト: `apps/server/scripts/backfill-translations.ts`
- 使い方例（英語を一旦コピーするモード）:

  ```bash
  # 英語をコピーする場合は戦略を指定
  AI_TRANSLATION_STRATEGY=copy \
  npx tsx apps/server/scripts/backfill-translations.ts --locale=ja-JP --batch=100
  ```

- スクリプトの挙動:
  - 既に `translations[ja-JP]` が存在するレコードはスキップ
  - `AI_TRANSLATION_STRATEGY=copy` を指定した場合は英語の値をそのままコピー
  - `AI_TRANSLATION_STRATEGY=none` にすると翻訳をスキップ（カスタム翻訳サービスを組み込む際のフック用）
  - 省略時のデフォルトは `ai`（Gemini）で、API キーが未設定の場合は自動的にスキップされます
  - 実行完了後に `processed`, `updated`, `skipped` の統計が標準出力に表示されます

## 3. 外部翻訳サービスの統合

- `src/services/localization-service.ts` の `maybeTranslateNutritionResponse` を拡張することで、AI や外部 API を利用した翻訳に差し替え可能です。
- 例: `AI_TRANSLATION_STRATEGY=gemini` のような新しい戦略を追加し、`backfill-translations.ts` からも同じ戦略を利用できます。

## 4. 実行前後に確認する項目

- スクリプト実行前に DB のバックアップを取得してください。
- バッチ終了後、サンプルの MealLog を確認し、`translations` が意図通り追加されているかをチェックします。
- モバイル/サーバー双方で、`ja-JP` を指定した際にフォールバックが解消されているかを確認します。
