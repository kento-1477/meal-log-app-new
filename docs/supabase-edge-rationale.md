# Supabase Edge Functions 移行の背景と理由

本プロジェクトでバックエンドを Supabase Edge Functions へ集約することにした背景を、これまでの検討内容から整理する。

## 1. 現行構成で発生していた問題

| 問題 | 詳細 |
| --- | --- |
| IPv4/IPv6 の非互換 | Render (IPv4) から Supabase Postgres (IPv6) へ直接接続できず、Prisma が頻繁に `Can't reach database server`（PrismaClientInitializationError）を吐いていた。Cloudflare Worker を挟んでも根本解決にならなかった。 |
| インフラが複雑 | Mobile → Cloudflare Worker → Render → Supabase という 3 層構成になっており、CORS・セッション・環境変数をそれぞれで管理する必要があった。 |
| コストと運用 | Render の起動待ちや再デプロイ時間、Cloudflare Worker/Render/Supabase の三重監視が必要になっていた。無料枠を活用しきれず、開発速度にも影響していた。 |

## 2. 採用方針

1. **Supabase Edge Functions に API を統合**  
   - Edge Functions は Cloudflare ネットワーク上で動作するため、Render を介さずにエッジでレスポンスできる。
   - Supabase の無料枠（Functions 50万リクエスト/月、DB 500MB）で完結できる。
   - Functions Secrets で Gemini などの API キーを一元管理できる。

2. **ORM/データアクセスを Edge 対応に置き換え**  
   - Prisma が Edge で安定動作しないため、Postgres.js/Drizzle + Supabase Auth/RLS を採用する。
   - 既存の `apps/server` ロジックを Hono ベースで移植し、Functions に展開する。

3. **インフラ簡素化**  
   - Cloudflare Worker は段階的に廃止し、Mobile アプリは直接 Supabase Functions を呼ぶ。
   - Render を撤去することで、IPv4/IPv6 問題と再デプロイ待ちがなくなる。
   - Supabase ダッシュボードでログ監視・環境変数管理・Auth/Storage/Realtime 連携が一元化できる。

## 3. 期待効果

- デプロイと起動の待ち時間がゼロに近づき、開発とリリースサイクルが短縮される。
- 無料枠内で API/DB を運用でき、追加コストなしでリリース可能。
- ポイント of フェイラーが減り、Mobile ↔ Supabase の 2 層構成で運用負荷が軽減。
- Supabase Auth/Storage/Realtime などの公式サービスを組み合わせやすくなり、今後の機能追加も簡素化される。

この背景を踏まえ、`docs/supabase-edge-plan.md` に沿って Supabase Edge Functions へ移行する。

