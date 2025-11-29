# Supabase Edge 移行後の切替・廃止計画

## 前提
- Edge Functions（auth / meal-log / iap / referral / ai）が本番デプロイ済みで、モバイルは `EXPO_PUBLIC_API_BASE_URL=https://<project>.functions.supabase.co` を参照。
- `ALLOWED_ORIGINS` に本番ドメインを設定済み（フォールバック任せにしない）。
- Supabase Postgres が唯一のDBとして利用されている。

## 切替手順（Cloudflare Worker / Render からの脱却）
1. **接続先を固定**  
   - EAS env の `EXPO_PUBLIC_API_BASE_URL` を Supabase Functions に固定（production/preview）。  
   - モバイルを再ビルド・配布し、Edge経由で正常動作することを確認。
2. **トラフィック監視**  
   - Supabase Logs Explorer で 4xx/5xx を確認し、異常がないことを確認。
3. **Cloudflare Worker の停止**  
   - DNS/Routes で Worker を外すか、`wrangler` で無効化。`TARGET_ORIGIN` を使ったプロキシを経由させない。  
   - 必要なら Cloudflare 側のDNSを Supabase Functions 直指しに変更。
4. **Render (apps/server) の停止**  
   - サービスを停止/スケール0。課金を止める。  
   - 監視・アラートが残っていれば解除。
5. **環境変数/Secrets の整理**  
   - Cloudflare/Render 用の Secrets を削除。Supabase に必要なものだけを残す。  
   - `.env` や CI Secrets から旧エンドポイントを削除。

## 旧 `apps/server` 依存の整理
- 参照が残っている場合は以下を順に実施：
  - root の `package.json` から `apps/server` ワークスペースと Prisma 関連の依存を削除。
  - CI スクリプトから `apps/server` ビルド/テストを外す。
  - `apps/server` ディレクトリをアーカイブ（必要なら別ブランチに退避）。
  - README / docs から Render 前提の記述を削除し、Supabase 専用に統一。
  - （現状）未実施。切替後に順次対応すること。

### 具体的な整理手順（例）
1. ワークスペース削除  
   - `package.json` の `workspaces` から `apps/server` を外す。  
   - `package-lock.json` は `npm install` で再生成。
2. CI/スクリプト更新  
   - `.github/workflows` 等に `apps/server` を参照するジョブがあれば削除。  
   - `npm run dev:server` などサーバ用スクリプトも削除/README修正。
3. 依存削減  
   - Prisma や `@types/express` などサーバ専用依存を root から削除し、`npm prune`。  
4. ディレクトリ退避  
   - `apps/server` を `apps/server-legacy/` に移動するか、別ブランチで保管。  
   - 参照が残っていないことを `rg "apps/server"` で確認。

## ロールバック方針
- もし Edge Functions に障害が出た場合は、一時的に `EXPO_PUBLIC_API_BASE_URL` を旧API（Cloudflare/Render）へ戻し、再ビルドして配布。  
- Cloudflare Worker を再度有効化してプロキシを復活させる。  
- 復旧後は再び Supabase を向かせる。

## チェックリスト
- [ ] Supabase Functions へ切替後、実機で主要フロー（ログイン/ログ投稿/履歴/IAP/紹介/A I）の疎通確認。  
- [ ] Cloudflare Worker 停止/DNS切替。  
- [ ] Render サービス停止・課金停止。  
- [ ] 旧環境Secrets/CI設定の削除。  
- [ ] `apps/server` 依存の除去・アーカイブ。  
