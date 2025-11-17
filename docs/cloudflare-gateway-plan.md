# Cloudflare Gateway 実装計画

## 目的と前提
- App Store 審査で使用できる **HTTPS の本番 API URL** を最短で確保する。
- 既存モノレポ（`apps/server` + `packages/shared`）をそのまま Workers へデプロイするのは重いため、まずは **薄い Gateway (Workers)** を作り、既存 API / Supabase へ中継する。
- 後続フェーズで本体 API を常駐化（Render / Railway / Fly.io）または段階的に Edge 化する。

---

## Phase 0: Cloudflare Gateway で入口のみ構築（最優先）

- [x] `apps/edge-gateway/` を作成し、`package.json`・`tsconfig.json` を最小構成で追加
- [x] `src/index.ts` に `/api/*` をターゲット API へ中継する Fetch Handler を実装  
  - CORS ヘッダ (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials` など) を付与  
  - 4xx/5xx もそのまま返却し、`console.log` にリクエストパス / ステータス / 所要時間を出力  
  - `/healthz` エンドポイントを用意
- [x] `wrangler.toml` を Gateway 用に配置し、Root directory を `apps/edge-gateway` に限定  
  ```toml
  name = "mealchat-gateway"
  main = "dist/index.js"
  compatibility_date = "2024-11-17"
  [vars]
  TARGET_ORIGIN = "https://<既存 API or Supabase REST>"
  ```
- [x] `package.json` にビルドスクリプトを追加  
  ```json
  { "scripts": { "build": "esbuild src/index.ts --bundle --platform=browser --outfile=dist/index.js", "deploy": "npm run build && wrangler deploy" } }
  ```
- [ ] `wrangler secret put SESSION_SECRET` など必要なシークレットを登録（Workers は `.env` 非対応）
- [ ] `TARGET_ORIGIN` に接続先（例: Supabase REST, Render の Node API）を設定し、`wrangler deploy` で `https://<name>.<account>.workers.dev` を取得
- [ ] Expo モバイルの `EXPO_PUBLIC_API_BASE_URL` / `app.json.expo.extra.apiBaseUrl` を Gateway URL に変更
- [ ] 実機＋プロキシ（Charles/Proxyman）で通信が通ることを確認 ※App Store 審査前に必須

---

## Phase 1: Gateway の品質強化

- [x] CORS 設定を本番ドメイン向けに調整（暫定 `*` → 固定ドメインへ）
- [x] Workers Ratelimit / KV / Durable Object を使い、ログイン等の簡易レート制限を追加
- [x] エラーハンドリングを統一（タイムアウト・fetch 失敗時も JSON で返却）
- [x] API パスを `/api/v1/*` に統一し、将来の差し替えやバージョニングを容易に
- [x] 監視用にステータスログ（ステータスコード、遅延）を出力

---

## Phase 2: 本体 API の常駐先 (Plan-A / Plan-B)

- **Plan-A（推奨）: Render / Railway / Fly.io で `apps/server` を常駐**
  - [ ] Node 環境に `npm run build --workspace apps/server && npm run start --workspace apps/server` を配置
  - [ ] `DATABASE_URL` には Supabase Postgres を使用
  - [ ] HTTPS / CORS / `/healthz` を有効化
  - [ ] Gateway の `TARGET_ORIGIN` をこの常駐 API に切り替え

- **Plan-B: Edge 化を進める場合**
  - [ ] Express ロジックを小さなハンドラ単位に分割し、Workers で動く形に書き換え
  - [ ] Prisma の代替（D1, HTTP 経由の API）を検討
  - [ ] esbuild/Vite で単一バンドルを作成し、`apps/server-worker` のようなディレクトリにまとめる

- [x] README に「本番 URL の決め方」「ENV vs app.json の切り替え方法」「Gateway 経由/直アクセスの手順」を追記

---

## Phase 3: 運用・CI

- [ ] GitHub Actions 等で `main` への push → `npm run build` → `wrangler deploy` の自動化
- [ ] Gateway / 常駐 API のヘルスチェックを監視
- [ ] 追加で Edge 化したい API は Gateway からルーティング可能な別 Worker へ分離

---

## 付録: Secrets と設定の目安

- `TARGET_ORIGIN` … 中継先の本体 API URL（Supabase REST, Render 等）
- `SESSION_SECRET`, `JWT_SECRET` … 認証関連（必要なもののみ）
- `ALLOWED_ORIGINS` … CORS 用の許可ドメイン（必要に応じて）
- モバイルアプリでは `EXPO_PUBLIC_API_BASE_URL` を常に Worker の https URL に揃え、審査端末で HTTPS 通信が行われるようにする
