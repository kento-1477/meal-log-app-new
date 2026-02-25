# Meal Log App

Apple-inspired mobile experience for logging meals via chatbot, powered by an Express + Prisma API and Supabase Edge Functions with Gemini AI hedged calls.

## Repository layout

- `apps/server` – Node.js API implementing authentication, meal ingestion, Gemini hedging, idempotency, and analytics endpoints.
- `apps/mobile` – Expo React Native client with login, chat, and dashboard tabs.
- `apps/edge-gateway` – Cloudflare Workers proxy that exposes a stable HTTPS URL for the mobile client and forwards to your origin API (optional).
- `supabase` – Supabase config plus Edge Functions (auth, meal-log, iap, referral, ai).
- `packages/shared` – Shared TypeScript contracts (Zod schemas, API types).
- `docs` – Architecture and timeout tuning notes.

## Prerequisites

- Node.js 18+ (tested with 22.17.1)
- npm 9+ or pnpm/yarn with workspace support
- Expo CLI (`npm install -g expo-cli`) for running the mobile client
- Supabase CLI (optional, for Edge Functions)
- PostgreSQL (local Docker, Neon, etc.)

## Environment variables

Copy `.env.example` to `apps/server/.env.local` and adjust (server envs):

```
PORT=4000
SESSION_SECRET=<your-session-secret>
DATABASE_URL=<your-database-url>
APPLE_SERVICE_ID=com.meallog.app
GEMINI_API_KEY=<your-gemini-api-key>
AI_ATTEMPT_TIMEOUT_MS=25000
AI_TOTAL_TIMEOUT_MS=35000
AI_HEDGE_DELAY_MS=5000
AI_MAX_ATTEMPTS=2
AI_TRANSLATION_STRATEGY=ai
IAP_TEST_MODE=false
IAP_TEST_MODE_TOKEN=
IAP_OFFLINE_VERIFICATION=false
APP_STORE_SHARED_SECRET=<your-shared-secret>
APP_STORE_BUNDLE_ID=com.meallog.app
TRUST_PROXY=false
```

> Generate `SESSION_SECRET` with a strong random value (for example `openssl rand -hex 32`) and keep secrets in `apps/server/.env.local`.
> Without `GEMINI_API_KEY` the server falls back to a deterministic mock response so flows stay testable. When `AI_TRANSLATION_STRATEGY=ai` and no key is configured, translations gracefully fall back to English.
>
> Tests require `DATABASE_URL` (or `TEST_DATABASE_URL`) to be exported via your shell/CI; `.env.test` is intentionally not tracked.

### Expo mobile API base URL

The mobile client resolves its API base URL from `EXPO_PUBLIC_API_BASE_URL` or `apps/mobile/app.json` (`expo.extra.apiBaseUrl`). The repo default points to Supabase Edge Functions.

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
```

Set this when running the Node API locally, or point it at your local Supabase Functions URL if you are using `supabase functions serve`.

### Secret management policy

- Do **not** commit `.env.local`, `.env.*.local`, or any environment files containing real credentials (already ignored via `.gitignore`).
- Store production secrets in your team’s secret manager (1Password, AWS Secrets Manager, etc.) and inject them via deployment pipelines.
- Rotate leaked credentials immediately and record the rotation in `docs/security-remediation-plan.md`.
- In production, ensure `IAP_TEST_MODE=false` and supply real Apple/Google verification secrets; test mode must only be enabled in isolated dev sandboxes.
- Run `npm run scan:secrets` before pushing to catch obvious leaks (fails CI if patterns are found).

### Optional: ローカルでプランを強制する

開発時に全ユーザーを一時的に `FREE` / `PREMIUM` として扱いたい場合は、`apps/server/.env.local`（Edge Functions を使う場合は Supabase の secrets）に次の環境変数を追加してください。

```
USER_TIER_OVERRIDE=PREMIUM
```

`FREE` か `PREMIUM` を指定できます。変数を設定していない場合は、データベース上の実際のプランがそのまま使われます。

## Install dependencies

```bash
npm install
```

This installs workspace packages for server, mobile, and shared contracts.

## Database setup

Update `.env.local` with your PostgreSQL connection string (JSONB-ready). Then run:

```bash
cd apps/server
npx prisma generate
npx prisma migrate dev --name init_pg
npx prisma db seed
```

> Development-only reset: `prisma migrate reset` wipes data; avoid on shared databases.

### Reset schema (matches CI pipeline)

CI uses a disposable Postgres container reachable at `<postgresql://USER:PASSWORD@localhost:5432/meal_log_test>`. To mirror the same settings locally, run:

```bash
DATABASE_URL=<postgresql://USER:PASSWORD@localhost:5432/meal_log_dev?schema=public> \
  npm run migrate:reset
```

The script wraps `prisma migrate reset --force --skip-generate --skip-seed`, so keep `DATABASE_URL` pointed at a throwaway database. Add a `DATABASE_URL` with the same credentials to `.env.test` if you want local `npm test` to touch a clean database during integration runs.

For JSONB query performance, add a GIN index after migration:

```sql
CREATE INDEX IF NOT EXISTS "MealLog_aiRaw_gin"
  ON "MealLog" USING GIN ("aiRaw");
```

### Demo data seeding

`apps/server/prisma/seed` only inserts the demo account when either:

- `NODE_ENV=development`, or
- `SEED_DEMO_USER=true`

Provide a custom password via `DEMO_USER_PASSWORD` (>= 12 chars); otherwise a random password is generated and printed to the console. Avoid running the seed script against any shared/staging/production database unless you explicitly need a demo account.

To verify that no demo accounts exist in a given database, run:

```bash
cd apps/server
node scripts/audit-demo-users.ts
```

## Running the backend

```bash
npm run dev:server
```

- Serves API on `http://localhost:4000`
- Key endpoints:
  - `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/session`
  - `POST /log` multipart chat ingestion (+ idempotency guard)
  - `POST /log/choose-slot` optimistic slot updates
  - `GET /api/logs`, `GET /api/log/:id`, `GET /api/logs/summary`
  - `GET /api/foods/search`
  - `GET /debug/ai`, `GET /debug/ai/analyze`

Debug routes are only enabled outside production.

## Running Supabase Edge Functions (local)

```bash
npm run supabase:serve
```

- Serves Edge Functions via the Supabase CLI (auth, meal-log, iap, referral, ai).
- Reads secrets from `supabase/.env.supabase.local` when present.
- Use the CLI output URL as `EXPO_PUBLIC_API_BASE_URL` if you want the mobile app to hit local functions.

## Running the mobile app

```bash
cd apps/mobile
npx expo start --clear
```

- Scan the QR code (Expo Go) or press `i`/`a` for simulator.
- Login with `demo@example.com` and the seeded password (printed during `prisma db seed` or set via `DEMO_USER_PASSWORD`).
- Chat tab supports text + image attachment, renders nutrition cards, and surfaces guardrail warnings.
- Dashboard tab surfaces daily totals, 7-day trends, and recent meals, and now shows the refreshed macro rings with “current / target” copy along with left/over states.

By default the app uses `apps/mobile/app.json` (`expo.extra.apiBaseUrl`). Override with `EXPO_PUBLIC_API_BASE_URL` to point at your local Node API or local Supabase Functions URL.

## Deployment

This repo supports two backends. The mobile client defaults to Supabase Edge Functions via `apps/mobile/app.json`.

### Option A: Supabase Edge Functions (default)

1. Configure Supabase secrets (GEMINI_API_KEY, IAP, etc).
2. Deploy functions:
   ```bash
   npm run supabase:deploy
   ```
3. Ensure the mobile base URL points at `https://<project>.functions.supabase.co` (already set in `apps/mobile/app.json`).

### Option B: Node API + optional Cloudflare gateway

1. Provision a Node-friendly host (Render, Railway, Fly.io, or any VM).
2. Set `DATABASE_URL`, `SESSION_SECRET`, and other secrets in that host.
3. Deploy the server:
   ```bash
   npm run build --workspace apps/server
   npm run start --workspace apps/server
   ```
4. Confirm `https://<your-origin-host>/healthz` returns 200 and configure your host’s health check feature to `/healthz`.
5. Optional: deploy `apps/edge-gateway` for HTTPS + CORS + rate limiting.
   ```bash
   npm run deploy --workspace apps/edge-gateway
   ```
   - Configure `TARGET_ORIGIN`, `ALLOWED_ORIGINS`, `API_PREFIX`, and rate limit vars in `apps/edge-gateway/wrangler.toml` or via Worker vars.
   - `API_PREFIX` defaults to `/api`; ingestion is `POST /log`, so set `API_PREFIX=/` or move `/log` under `/api` if you want the gateway to proxy ingestion.
6. Point `EXPO_PUBLIC_API_BASE_URL` at the origin or gateway URL.

### Testing App Store subscriptions (sandbox)

1. In `.env.local` set `IAP_TEST_MODE=true` (default is `false`) so the backend accepts locally-generated base64 receipts.
2. Configure `APP_STORE_SHARED_SECRET` with the App Store Connect shared secret. For local tests a dummy value is fine; production requires the real secret.
3. Product identifiers are fixed in code:
   - Premium: `com.meallog.premium.annual`
   - Credit pack: `com.meallog.credits.100`
4. Use an Apple Sandbox account on the simulator/physical device when exercising the real App Store purchase sheet.
5. To replay purchases without UI, run `npm run test:integration` which includes `iap.test.ts` and verifies the Premium grant path via the `/api/iap/purchase` endpoint.

## Gemini configuration notes

- Hedging uses multiple attempts with configurable attempt timeout, total timeout, and hedge delay (Node) plus model-chain retries (Edge).
- Edge model selection is controlled by `GEMINI_MODEL_CHAIN` (or `GEMINI_PRIMARY_MODEL` / fallback vars when chain is unset).
- Guardrail marks logs where any total is zero, preventing idempotent reuse and flagging warnings in UI.
- Observability: `/debug/ai` returns per-attempt latency, active model selection, and attempt reports (non-prod only).
- Operational runbook and recommended chain: `docs/ai-model-routing.md`.

## Testing & linting

- Lint (all workspaces): `npm run lint`
- All workspace tests + secrets scan: `npm test`
- Server unit tests: `npm run test --workspace apps/server`
- Dual-write regression: `npm run test:golem`
- Mobile: `npm run test --workspace apps/mobile` (Node test runner + custom TS loader validating chart guards and ring math)

## Next steps

1. Wire real image uploads (S3/Supabase) instead of data URIs stored in PostgreSQL.
2. Introduce user-configurable nutrition targets (persisted per account) and pipe them into the scaled dashboard logic.
3. Extend guardrails with Prometheus metrics (`/metrics`) and alerting on AI failure rate.
4. Add push notification reminders using Expo Notifications and scheduled jobs.

## Contribution workflow

1. Create a feature branch: `git switch -c feat/<topic>`
2. Build the change and keep commits following [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
3. Run quality gates locally: `npm run lint && npm test && npm run test:golem`
4. Push the branch: `git push -u origin feat/<topic>`
5. Open a PR, confirm the `ci-test` and `diff-gate` checks pass, and request a review from the CODEOWNERS assignee
6. Address feedback, then complete the PR using **Squash & merge** to keep history linear
