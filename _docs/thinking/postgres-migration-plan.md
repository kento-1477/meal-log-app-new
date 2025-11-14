# PostgreSQL 接続エラー対処計画

- [✅] **現状確認**
  - [✅] ~~Prisma で `DATABASE_URL` を読み込んでいるが、`P1001: Can't reach database` で失敗~~ → **解決済み**
  - [✅] ~~Supabase 側と通信が確立できておらず、マイグレーション・シードが未実行~~ → **接続確立し、`migrate dev` 完了**
  - [✅] `SESSION_SECRET` はプレースホルダー、`GEMINI_API_KEY` 未設定（後続で更新予定）

---

## 1. 接続情報の正当性チェック
- [✅] Supabase プロジェクトの **Connection string** を再確認し、ユーザー／パスワード／DB 名／ポートが一致しているか確認する
- [✅] パスワードに `@` や `/` などが含まれている場合、URL エンコードされているか確認する
- [✅] `.env` の `DATABASE_URL` を公式の文字列と突き合わせ、不要な空白・改行が入っていないかチェックする

## 2. ネットワーク疎通テスト
- [✅] ローカルからデータベースホストへの TCP 接続を確認
  - [✅] `nc -vz <your-db-host> 5432` → **成功**
- [✅] 企業ネットワーク／VPN／ファイアウォールが 5432 番ポートの外向き通信をブロックしていないか確認する
- [ ] 必要に応じて別ネットワーク（テザリング等）で再試行し、環境依存の問題かを切り分ける（今回は不要でした）

## 3. CLI で直接接続テスト
- [✅] `psql` を使って同じ接続文字列でログインを試行
  - [✅] `psql "postgres://..."` → **成功**
- [ ] 成功した場合、Supabase 側で `\dt` などを打ち、権限に問題が無いか確認する  *(任意)*
- [ ] 失敗する場合、エラーメッセージ（証明書・認証・タイムアウト等）をもとに原因を特定する（今回は不要でした）

## 4. Prisma マイグレーションと生成
- [✅] 接続が確認できたら `apps/server` で以下を順に実行
  - [✅] `npx prisma format` *(実行済み)*
  - [✅] `npx prisma migrate dev --name init_pg`
  - [✅] `npx prisma generate`
  - [✅] `npx prisma db seed` *(実行済み)*
- [✅] `prisma/migrations/*/migration.sql` に JSONB 用 GIN インデックス（必要なら）を追記し適用する

## 5. アプリ動作確認
- [✅] サーバーを起動 (`npm run dev`)
- [✅] `/log` へチャット投稿し、`MealLog.aiRaw` に JSONB が保存されているか Prisma Studio / SQL で確認
- [✅] `/api/logs`, `/api/log/:id`, `/debug/ai` など API の基本フローをテスト
- [✅] 失敗時の 500 レスポンスや idempotency が動作しているか合わせて確認する

## 6. 追加設定
- [✅] `.env` の `SESSION_SECRET` を本番相当のランダム値へ更新
- [✅] `GEMINI_API_KEY` を必要に応じて設定し、AI 呼び出しができるか確認
- [✅] README 等に PostgreSQL 接続手順・トラブルシューティングを追記済みか最終確認する
