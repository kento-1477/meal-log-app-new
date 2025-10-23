# Meal Log App Architecture Overview

This repository hosts a full-stack mobile-first implementation of the Meal Log App described in the product specification. The solution is organised as a monorepo with separate packages for the mobile client, backend API, and shared domain logic.

## Monorepo layout

```
apps/
  mobile/      # Expo + React Native client targeting iOS/Android
  server/      # Express + Prisma backend API
packages/
  shared/      # Shared TypeScript utilities and models
config/        # Shared configuration (tsconfig, eslint, etc.)
docs/          # Project documentation
```

## Technology choices

- **Mobile client:** Expo + React Native with React Navigation for screen management and Zustand for lightweight state. The UI mimics Apple design language via native components, system fonts, and blurred surfaces.
- **Backend API:** Node.js (Express) with Prisma ORM targeting PostgreSQL (Neon/local Docker) with JSONB nutrition payloads. Session-based authentication uses `express-session` with a configurable store. AI calls are routed through a Gemini service wrapper featuring hedge/timeout control.
- **Shared contracts:** Zod schemas define request/response types shared between client and server.
- **Tooling:** TypeScript throughout, tsx for development-time execution, Jest + React Native Testing Library for unit/UI tests, and ESLint/Prettier configs shared across packages.

## Data flow

1. The mobile app authenticates via `/api/login`, storing the session cookie using Expo Secure Store. Session state is polled via `/api/session` on launch.
2. Chat messages are posted as multipart form data to `/log`, optionally including an image. The server performs idempotency checks, orchestrates Gemini calls with hedged attempts, applies guardrails, persists to `meal_logs`, and returns the AI analysis.
3. The dashboard fetches aggregated data from `/api/logs` and displays nutrition trends using cached responses.
4. Debug and admin tooling surfaces latency metrics from the Gemini hedge executor and exposes them at `/debug/ai`.

## Key server components

- `GeminiClient`: Wraps Google Generative Language API calls, enforces JSON schema adherence, and emits telemetry for each attempt.
- `HedgeExecutor`: Launches concurrent attempts with configurable total timeout and delay, returning the first successful response.
- `LogService`: Coordinates idempotency, guardrails, and persistence into `meal_logs` and `ingest_requests`.
- `AuthService`: Handles registration, login, session validation, and password hashing via Argon2.
- `MetricsService`: Records attempt latency, success rates, and guardrail incidents for future observability.

## Mobile experience highlights

- **Login:** Minimal form with Apple-inspired glassmorphism background.
- **Chat:** Bubble-based conversation, message composer with attachment button, animated nutrition cards, and explicit error handling banners.
- **Dashboard:** Today summary, macro breakdown cards, scrollable recent meals, and placeholder chart using Victory Native.

## Environment configuration

Environment variables are centralised in `.env.example` with support for AI timeout tuning (`AI_ATTEMPT_TIMEOUT_MS`, `AI_TOTAL_TIMEOUT_MS`, `AI_HEDGE_DELAY_MS`, `AI_MAX_ATTEMPTS`) and secrets (`GEMINI_API_KEY`, session keys).

For local development, run `npm install` at the root to install workspace dependencies, then use the provided scripts:

```
npm run dev:server  # start backend with tsx watch
npm run dev:mobile  # launch Expo development client
```

Switching to Postgres requires updating `DATABASE_URL` and running `npx prisma migrate dev` within `apps/server`.

## Next steps

- Integrate real charting data and success metrics on the dashboard once backend analytics endpoints are complete.
- Wire up push notification reminders using Expo Notifications and a cron worker.
- Extend guardrail logging to Prometheus metrics endpoints under `/metrics`.
