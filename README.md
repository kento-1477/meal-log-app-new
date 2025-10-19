# Meal Log App

Apple-inspired mobile experience for logging meals via chatbot, powered by an Express + Prisma backend and Gemini AI hedged calls.

## Repository layout

- `apps/server` – Node.js API implementing authentication, meal ingestion, Gemini hedging, idempotency, and analytics endpoints.
- `apps/mobile` – Expo React Native client with login, chat, and dashboard tabs.
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
SESSION_SECRET=super-secret
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/meal_log?schema=public
GEMINI_API_KEY=your-google-generative-language-key
AI_ATTEMPT_TIMEOUT_MS=25000
AI_TOTAL_TIMEOUT_MS=35000
AI_HEDGE_DELAY_MS=5000
AI_MAX_ATTEMPTS=2
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
```

> Generate `SESSION_SECRET` with a strong random value (for example `openssl rand -hex 32`) and keep secrets in `.env.local`.
> Without `GEMINI_API_KEY` the server falls back to a deterministic mock response so flows stay testable.

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

CI uses a disposable Postgres container reachable at `postgresql://postgres:postgres@localhost:5432/meal_log_test`. To mirror the same settings locally, run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meal_log_dev?schema=public \
  npm run migrate:reset
```

The script wraps `prisma migrate reset --force --skip-generate --skip-seed`, so keep `DATABASE_URL` pointed at a throwaway database. Add a `DATABASE_URL` with the same credentials to `.env.test` if you want local `npm test` to touch a clean database during integration runs.

For JSONB query performance, add a GIN index after migration:

```sql
CREATE INDEX IF NOT EXISTS "MealLog_aiRaw_gin"
  ON "MealLog" USING GIN ("aiRaw");
```


Default seed creates `demo@example.com` / `password123` for quick login.

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
