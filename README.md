# Meal Log App

Apple-inspired mobile experience for logging meals via chatbot, powered by an Express + Prisma backend and Gemini AI hedged calls.

## Repository layout

- `apps/server` – Node.js API implementing authentication, meal ingestion, Gemini hedging, idempotency, and analytics endpoints.
- `apps/mobile` – Expo React Native client with login, chat, and dashboard tabs.
- `apps/edge-gateway` – Cloudflare Workers proxy that exposes a stable HTTPS URL for the mobile client and forwards to your origin API.
- `packages/shared` – Shared TypeScript contracts (Zod schemas, API types).
- `docs` – Architecture and timeout tuning notes.

## Prerequisites

- Node.js 18+ (tested with 22.17.1)
- npm 9+ or pnpm/yarn with workspace support
- Expo CLI (`npm install -g expo-cli`) for running the mobile client
- PostgreSQL (local Docker, Neon, etc.)

## Environment variables

Copy `.env.example` to `.env.local` and adjust:

```
PORT=4000
SESSION_SECRET=<your-session-secret>
DATABASE_URL=<your-database-url>
GEMINI_API_KEY=<your-gemini-api-key>
AI_ATTEMPT_TIMEOUT_MS=25000
AI_TOTAL_TIMEOUT_MS=35000
AI_HEDGE_DELAY_MS=5000
AI_MAX_ATTEMPTS=2
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
# In-app purchase testing (leave APP_STORE_SHARED_SECRET empty in dev if not using App Store validation)
IAP_TEST_MODE=true
APP_STORE_SHARED_SECRET=<your-shared-secret>
# 翻訳戦略（任意: `ai` | `copy` | `none`）
AI_TRANSLATION_STRATEGY=ai
# X-IAP-Test-Mode header secret (only required when running test mode outside local dev)
IAP_TEST_MODE_TOKEN=
# Offline verification skips Apple/Google calls. Enable only in local automated tests.
IAP_OFFLINE_VERIFICATION=false
# Proxy trust configuration. Leave empty to disable.
TRUST_PROXY=false
# Seed controls (only for local dev)
SEED_DEMO_USER=false
DEMO_USER_PASSWORD=
```

> Generate `SESSION_SECRET` with a strong random value (for example `openssl rand -hex 32`) and keep secrets in `.env.local`.
> Without `GEMINI_API_KEY` the server falls back to a deterministic mock response so flows stay testable. When `AI_TRANSLATION_STRATEGY=ai` and no key is configured, translations gracefully fall back to English.
>
> Tests require `DATABASE_URL` (or `TEST_DATABASE_URL`) to be exported via your shell/CI; `.env.test` is intentionally not tracked.

### Secret management policy

- Do **not** commit `.env.local`, `.env.*.local`, or any environment files containing real credentials (already ignored via `.gitignore`).
- Store production secrets in your team’s secret manager (1Password, AWS Secrets Manager, etc.) and inject them via deployment pipelines.
- Rotate leaked credentials immediately and record the rotation in `docs/security-remediation-plan.md`.
- In production, ensure `IAP_TEST_MODE=false` and supply real Apple/Google verification secrets; test mode must only be enabled in isolated dev sandboxes.
- Run `npm run scan:secrets` before pushing to catch obvious leaks (fails CI if patterns are found).

### Optional: ローカルでプランを強制する

開発時に全ユーザーを一時的に `STANDARD` プランとして扱いたい場合は、サーバー側の `.env.local` に次の環境変数を追加してください。

```
USER_PLAN_OVERRIDE=STANDARD
```

`FREE` か `STANDARD` を指定できます。変数を設定していない場合は、データベース上の実際のプランがそのまま使われます。

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


Default seed creates `demo@example.com` / `password123` for quick login.

### Demo data seeding

`apps/server/prisma/seed` only inserts the demo account when either:

- `NODE_ENV=development`, or
- `SEED_DEMO_USER=true`

Provide a custom password via `DEMO_USER_PASSWORD`; otherwise a random password is generated and printed to the console. Avoid running the seed script against any shared/staging/production database unless you explicitly need a demo account.

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

## Running the mobile app

```bash
cd apps/mobile
npx expo start --clear
```

- Scan the QR code (Expo Go) or press `i`/`a` for simulator.
- Login with `demo@example.com` / `password123`.
- Chat tab supports text + image attachment, renders nutrition cards, and surfaces guardrail warnings.
- Dashboard tab surfaces daily totals, 7-day trends, and recent meals, and now shows the refreshed macro rings with “current / target” copy along with left/over states.

Ensure the Expo app is pointed at the same host as the server (`EXPO_PUBLIC_API_BASE_URL`). For physical devices on the same network, set this value to your machine’s LAN IP.

## Deployment (Gateway + Origin)

You now have two layers:

1. **Origin API (Render / Railway / Fly.io / Supabase REST など)** – runs the existing `apps/server` Express + Prisma app.
2. **Cloudflare Gateway (`apps/edge-gateway`)** – a thin Workers proxy that exposes an HTTPS URL for the mobile app, handles CORS, health checks, and rate limiting, then forwards traffic to the origin.

### Step 1: Prepare the origin API

1. Provision a Node-friendly host (Render, Railway, Fly.io, or any VM).
2. Set `DATABASE_URL`, `SESSION_SECRET`, and other secrets in that host.
3. Deploy the server:
   ```bash
   npm run build --workspace apps/server
   npm run start --workspace apps/server
   ```
4. Confirm `https://<your-origin-host>/healthz` returns 200.

### Step 2: Deploy the Cloudflare Gateway

1. Navigate to `apps/edge-gateway`.
2. Set the Worker variables/secrets (one-time):
   ```bash
   # HTTPS origin that actually performs the business logic
   npx wrangler secret put TARGET_ORIGIN
   # Session/token secrets if the gateway needs to sign/verify anything
   npx wrangler secret put SESSION_SECRET
   # Optional: restrict CORS
   npx wrangler secret put ALLOWED_ORIGINS   # e.g. https://meal-log.app,https://staging.meal-log.app
   ```
3. Deploy:
   ```bash
   npm run deploy --workspace apps/edge-gateway
   ```
4. The Worker issues a URL like `https://mealchat-gateway.<account>.workers.dev`. Use this value for `EXPO_PUBLIC_API_BASE_URL` (or set `app.json > expo.extra.apiBaseUrl`) so the mobile client always talks to the HTTPS gateway.

### Step 3: Verify end-to-end

- Run the Expo app on a device connected over LTE/Wi-Fi and confirm requests succeed.
- Use Charles/Proxyman if you need to inspect requests from the device (install the proxy certificate for HTTPS).
- Once verified, submit the build to App Store Connect. The ATS requirement is satisfied because the gateway URL is HTTPS.

> Need to bypass the gateway temporarily? Point `EXPO_PUBLIC_API_BASE_URL` directly to the origin host. Because the mobile app only depends on that environment variable, switching endpoints takes a single config change.

### Testing App Store subscriptions (sandbox)

1. In `.env.local` set `IAP_TEST_MODE=true` (already the default) so the backend accepts locally-generated base64 receipts.
2. Configure `APP_STORE_SHARED_SECRET` with the App Store Connect shared secret. For local tests a dummy value is fine; production requires the real secret.
3. Product identifiers are fixed in code:
   - Premium: `com.meallog.premium.annual`
   - Credit pack: `com.meallog.credits.100`
4. Use an Apple Sandbox account on the simulator/physical device when exercising the real App Store purchase sheet.
5. To replay purchases without UI, run `npm run test:integration --workspace apps/server` which includes `iap.test.ts` and verifies the Premium grant path via the `/api/iap/purchase` endpoint.

## Gemini configuration notes

- Hedging uses `Promise.any` with configurable attempt timeout, total timeout, and hedge delay.
- The final attempt automatically switches to `models/gemini-2.5-pro` as a fallback.
- Guardrail marks logs where any total is zero, preventing idempotent reuse and flagging warnings in UI.
- Observability: `/debug/ai` reports per-attempt latency, key tail, and active model selection.

## Testing & linting

- Lint (all workspaces): `npm run lint`
- Server unit tests: `npm test` (runs `node --test` in `apps/server/tests`)
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
