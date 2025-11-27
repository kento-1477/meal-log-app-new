# Supabase Secrets / 運用メモ

## Secrets 設定（Functions 用）
以下を Supabase Dashboard → Functions → Secrets で設定するか、CLI で `supabase secrets set ...` してください。

必須:
- `SUPABASE_URL` … プロジェクトのURL
- `SERVICE_ROLE_KEY` … サービスロールキー（または `SUPABASE_SERVICE_ROLE_KEY`）
- `JWT_SECRET` … Edge Functions で署名/検証に使う共通シークレット

オプション/ドメイン別:
- `GEMINI_API_KEY` … AIエンドポイント用
- `APP_STORE_SHARED_SECRET` … IAP(App Store)検証用
- `ALLOWED_ORIGINS` … CORS許可ドメイン（カンマ区切り）。指定推奨。
- `AI_ATTEMPT_TIMEOUT_MS` など AI チューニング値

CLI 例:
```bash
cd supabase
supabase secrets set \
  SERVICE_ROLE_KEY=... \
  SUPABASE_URL=... \
  JWT_SECRET=... \
  APP_STORE_SHARED_SECRET=... \
  GEMINI_API_KEY=... \
  ALLOWED_ORIGINS=https://meal-log.app,https://app.meal-log.app
```

## Functions のデプロイ
```bash
cd supabase
supabase functions deploy auth meal-log iap referral ai --import-map ./functions/deno.json
```

## ログ/メトリクスの見方
- Supabase Dashboard → Logs & Analytics → Explorer で BigQuery 方言のクエリを実行。
- 例: meal-log のエラーを直近50件見る
```sql
select timestamp, request.url, response.status_code as status, event_message
from function_edge_logs as t
cross join unnest(t.metadata) as metadata
cross join unnest(metadata.request) as request
cross join unnest(metadata.response) as response
where regexp_contains(request.url, r"/meal-log/") and response.status_code >= 400
order by timestamp desc
limit 50;
```

## 旧インフラ停止のメモ
- Cloudflare Worker: Supabase Functions への切替が完了したら、DNS/Route を Functions に向け、Worker を disable。
- Render (apps/server): トラフィック切替後、インスタンス停止・課金停止。データは Supabase に移行済みか最終確認。
