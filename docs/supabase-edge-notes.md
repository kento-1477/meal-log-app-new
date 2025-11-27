# Supabase Edge 置き換えメモ（進捗・手順・ハマりポイント）

本プロジェクトを Supabase Edge Functions へ移行する際の経緯と手順をまとめたメモです。次の担当者がゼロから着手できるように、現状、残タスク、デプロイ方法、ログの見方を記載しています。

## 1. 現状サマリ
- **auth**: supabase-js + bcrypt 化済み。セッション Cookie は `ml_session`。未認証時は 401 を返す。
- **meal-log**: ルートを `/meal-log` 配下に統一。CRUD/ダッシュボード/カロリートレンド/お気に入り等を supabase-js へ移行済み。  
- **ai**: Gemini 呼び出し＋usage カウントを実装。locale が ja-* の場合は日本語で応答。
- **referral**: invite-link / my-status / claim を実装（PremiumGrant 付与、重複/本人/レート制限チェックあり）。
- **iap**: App Store の購入検証＋PremiumGrant/aiCredits 付与を実装・デプロイ済み。**Google Play は未実装（後回し）**。
- **モバイル**: `API_BASE_URL` は Functions を指している。認証 API は Cookie/Bearer 両対応。

## 2. 直近の変更ポイント
- meal-log ルーティング修正：`/meal-log` をベースパスにし、/health, /api/health を追加。未認証は 401 JSON を返す。
- ai: デバッグ用エンドポイントを追加し、AI使用状況の確認・カウントのみ可能（Gemini呼び出しはダミー）。
- ログイン/パスワードハッシュを bcrypt 化、auth/meal-log の supabase-js への移行。
- requireAuth: セッションなしの場合は throw せず 401 JSON で返却。
- CORS: `ALLOWED_ORIGINS` 未設定の場合はリクエスト元オリジンを許可するよう fallback を調整（Cookie を使った認証に対応）。

## 3. 残タスク（優先順）
1) **IAP (Google Play) 実装**  
   - 現在は App Store のみ対応。Google Play 検証＋PremiumGrant/aiCredits 付与を Edge へ追加。  
   - Play 用の秘密鍵を Secrets に設定。
2) **AI/Meal-log の翻訳品質向上（必要なら）**  
   - 旧 `maybeTranslateNutritionResponse` などの翻訳フローを Edge に移植。
3) **モバイル側 Auth/JWT 周りの整理**  
   - Cookie `ml_session` / Bearer 両対応の動作確認とドキュメント化。  
4) **meal-log 仕上げ**  
   - 実機での 200/401/500 確認、キャッシュ/304 が必要なら再実装。  
5) **インフラ/ドキュメント**  
   - Secrets 設定手順、旧インフラ停止計画（Cloudflare/Render）をまとめる。  
   - Logs/Analytics の見方をドキュメント化。

## 4. デプロイ手順
```bash
# ルートで実行
supabase functions deploy meal-log
supabase functions deploy auth
supabase functions deploy ai
supabase functions deploy referral
# iap を実装したら同様に deploy
```
- Secrets は Supabase Dashboard の Functions → Secrets で設定。  
- サービスロール: `SERVICE_ROLE_KEY`（または旧 `SUPABASE_SERVICE_ROLE_KEY`）必須。  
- Gemini 等を使う場合は `GEMINI_API_KEY` を追加。

## 5. ログの見方（Logs Explorer）
- BigQuery 方言なので `cross join unnest` が必要。例：  
```sql
select
  timestamp,
  request.url,
  response.status_code as status,
  event_message
from function_edge_logs as t
cross join unnest(t.metadata) as metadata
cross join unnest(metadata.request) as request
cross join unnest(metadata.response) as response
where regexp_contains(request.url, r"/meal-log/")  -- 例: meal-log だけ絞る
  and response.status_code >= 400                   -- エラーだけ見たい場合
order by timestamp desc
limit 50;
```
- SQL Editor（Postgres）ではなく Logs & Analytics の Explorer で実行すること。

## 6. よくあるハマりどころ
- Edge Functions のパスは「関数名が先頭に付く」: 関数名 `meal-log` → `/meal-log/...` にルートを書く。  
- Test 画面ではパスを変えられない（常に `/meal-log`）。サブパスを試すなら curl など外部ツールで直接叩く。  
- 未認証で叩くと 401。モバイル/ブラウザでログイン後の `ml_session` を Cookie か Bearer で渡す。  
- Logs Explorer は BigQuery 方言。`select *` 禁止、JSON 演算子は使えないので `cross join unnest` を使う。

## 7. 動作確認用の curl 例
- ヘルスチェック（公開）  
  ```bash
  curl -i https://<project>.functions.supabase.co/meal-log/health
  ```
- 認証が必要なAPI例（CookieかBearerを付与する）  
  ```bash
  curl -i 'https://<project>.functions.supabase.co/meal-log/api/calories?mode=daily&locale=ja-JP' \
    -H 'Cookie: ml_session=<JWT>'    # もしくは
    -H 'Authorization: Bearer <JWT>'
  ```
- AIデバッグ（ダミー応答）  
  ```bash
  curl -i 'https://<project>.functions.supabase.co/ai/api/debug/ai' \
    -H 'Cookie: ml_session=<JWT>'
  curl -i 'https://<project>.functions.supabase.co/ai/api/debug/ai/analyze?text=カレー' \
    -H 'Cookie: ml_session=<JWT>'
  ```

## 8. 次にやるべき実装の指針
### AI
- モバイルが期待するパスを確認（/api/ai/... を /ai 関数で受ける）。  
- `apps/server` の `log-service.ts` + `gemini-service.ts` を参考に、Gemini呼び出し→栄養解析→usageカウントを Edge に移植。  
- Secrets に `GEMINI_API_KEY`、必要ならモデル指定を追加。

### Referral
- Edge 実装済み（invite-link/my-status/claim）。レート制限・指紋チェックあり。

### IAP
- App Store 実装済み。Google Play は未実装（後回し）。  
- Secrets: `APP_STORE_SHARED_SECRET`（および必要ならテスト用のオプション）を Supabase に設定。

## 9. モバイル側の注意
- `apps/mobile/app.json` の `extra.apiBaseUrl` は Functions を向く。  
- `api.ts` で `/api/ai` → `/ai` 関数へルーティング。  
- 認証ヘッダーは Cookie/Bearer のどちらかで。401時の再ログインフローを確認。

## 10. 参考ファイル
- `docs/supabase-edge-plan.md` : 置き換え計画の詳細版
- `supabase/config.toml` : 関数ルーティング定義
- `supabase/functions/_shared/*` : 共通http/auth/ai等

このメモをベースに、AI → Referral → IAP の順で実装を進め、デプロイ後にモバイル実機で順次確認してください。未実装部分は既存apps/serverを参照しつつ、レスポンス形をモバイル仕様に合わせてください。
