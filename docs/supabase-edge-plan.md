# Supabase Edge Functions 置き換え計画（詳細版）

## 0. 現状と課題の整理

| 項目 | 現構成 | 課題 |
| --- | --- | --- |
| フロント | Expo Router（apps/mobile） | 問題なし |
| API ゲートウェイ | Cloudflare Worker (apps/edge-gateway) | CORS/RateLimit 目的のみ |
| アプリサーバ | Render 上の Node/Express + Prisma (apps/server) | IPv4 → Supabase(IPv6) 接続失敗、デプロイ負荷＆コスト |
| DB | Supabase Postgres | 取り回しは良いが Render から直結不可 |

**目標構成**：Mobile → Supabase Edge Functions (Hono + Supabase SDK/Postgres.js) → Supabase Postgres  
Render と Cloudflare Worker を段階的に排除し、Supabase の無料枠で API・Secret 管理を完結させる。

---

## 1. 設計およびプロジェクト準備

- [x] Supabase CLI を導入し、`supabase/` ディレクトリをプロジェクトルートに配置する。
- [x] `supabase/functions/<domain>` ごとにフォルダを切り、`supabase/config.toml` でルーティング定義を行う。
- [ ] `apps/server/src/routes` / `services` を棚卸しし、以下のドメイン毎に Edge Function へマッピングする。
  - `auth`（ログイン/登録/セッション）
  - `meal-log`（ログ CRUD、ダッシュボード、favorites）
  - `iap`（In-App Purchases エンドポイント）
  - `referral`（紹介プログラム）
  - `ai`（Gemini 呼び出し）

---

## 2. 技術選定

### 2.1 ランタイム／フレームワーク
- [x] Supabase Edge Functions（Deno ランタイム）を利用し、フレームワークには **Hono** を採用する。
- [x] 既存 Express ミドルウェアを Hono ミドルウェアにリプレイスするための共通ラッパーを `supabase/functions/_shared/http.ts` などに作成。

### 2.2 データアクセス
- [x] Prisma → Postgres.js or Drizzle への置き換え方針を決定（Edge で安定動作するものを優先）。
- [x] Supabase Auth/RLS を利用する想定で、JWT の発行・検証を Edge Function で扱う設計を記述。
- [x] 既存 Prisma クエリを SQL/Drizzle に落とし込むためのモジュール（例：`supabase/functions/_shared/db.ts`）を追加。

### 2.3 セッション／Auth
- [x] `req.session` 依存のロジックを廃止し、Supabase Auth (JWT) ベースの認証フローへ切り替える。
- [ ] Mobile 側 `api.ts` を更新し、Supabase Edge Functions から返される JWT/クッキーに対応させる。

---

## 3. 実装ブレイクダウン

### 3.1 `auth` Function
- [x] `/api/login`：email/password を受け取り、Supabase DB でユーザ検証 → JWT 発行。
- [x] `/api/register`：既存 `registerUser` ロジックを移植し、RLS に対応する初期データ作成を行う。
- [x] `/api/session`：JWT 検証→ユーザ情報を返却。Supabase Auth を利用する場合は `getUser` を呼び出す。

### 3.2 `meal-log` ドメイン
- [x] Meal Log CRUD、Dashboard、Favorites を Edge Function に移植。 *(CRUD は実装、Dashboard/Favorites は今後拡張予定)*
- [ ] 304/キャッシュ処理を必要に応じて Supabase の `cache-control` ヘッダまたは Edge Side Cache で再実装。

### 3.3 `iap` Function
- [ ] `expo-in-app-purchases` 検証ロジックを Edge Function へ移植。
- [ ] App Store/Google Play シークレットを Supabase Secrets で管理。

### 3.4 `referral` / `ai` Function
- [ ] 既存の紹介コード生成/判定、Gemini API 呼び出しロジックを Edge Function へ移植。
- [ ] 環境変数は `supabase secrets set` で登録し、コードから `Deno.env.get` で参照。

### 3.5 共有レイヤー
- [x] レスポンスフォーマット、エラーハンドリング、認証ミドルウェアを `_shared/` にまとめ、各 Function から import して利用。

---

## 4. インフラ／デプロイ設定

- [x] `supabase/config.toml` に Function ごとのルートを定義。例：
  ```toml
  [[functions]]
  name = "auth"
  path = "supabase/functions/auth"
  verify_jwt = false
  ```
- [x] `package.json` に `supabase functions serve` / `deploy` スクリプトを追加し、CI/CD から呼べるようにする。
- [ ] Supabase Dashboard の `Functions → Secrets` で API キー等を設定。必要に応じて `supabase secrets set` を使った同期手順をドキュメント化。
- [ ] Cloudflare Worker / Render については段階的に停止する計画を別途作成（トラフィック切替、DNS/URL 更新手順を含む）。

---

## 5. フロントエンド側変更

- [ ] `API_BASE_URL` を Supabase Functions の URL (`https://<project>.functions.supabase.co`) に更新。
- [ ] CORS：Supabase Edge Functions 側の `response.headers.set('Access-Control-Allow-Origin', ...)` を設定、または Supabase 設定で許可。
- [ ] Mobile からの Cookie/JWT 振る舞いを確認し、`credentials` や Authorization Header を必要に応じて付与する。

---

## 6. テスト・ロールアウト

- [ ] `supabase functions serve` でローカルテスト（Mobile ↔ Edge Function ↔ Supabase）。
- [ ] Auth / Meal Log / IAP / Referral / AI ごとに API テスト（Postman, curl, or automated tests）。
- [ ] 本番 Supabase プロジェクトへ Functions をデプロイし、段階的に `EXPO_PUBLIC_API_BASE_URL` を切り替える。
- [ ] Render, Cloudflare Worker 側の監視を続けつつ、問題なければトラフィックを 100% Edge Functions に流し、旧インフラを撤去。

---

## 7. 移行後タスク

- [ ] Supabase でのログ/メトリクス確認手順をドキュメント化。
- [ ] `apps/server` ディレクトリをアーカイブまたは段階的に削除し、monorepo の依存（Prisma 等）を整理。
- [ ] 今後必要な機能（Auth、Storage、Realtime 等）は Supabase のサービスを活用して実装する方針を共有。

---

### 備考
- Prisma の Edge サポート状況を見つつ、Postgres.js/Drizzle での実装を優先。将来的に Supabase Data Proxy + Prisma Edge が安定したら差し替え検討。
- 移行期間中は Cloudflare Worker を単なるプロキシとして併存させても良いが、最終的には Supabase Functions の CORS 設定で直接アクセスさせる方が構成がシンプル。
- Supabase CLI/Secrets 管理手順を `docs/infra/supabase.md` などにまとめ、他メンバーが再現できるようにしておく。
