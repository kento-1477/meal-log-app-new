# Meal Log Server

Express + Prisma backend implementing the Meal Log API specification.

## Scripts

- `npm run dev` – start server with tsx watch
- `npm run build` – compile to `dist`
- `npm run start` – run compiled output
- `npm run lint` – lint TypeScript sources

## Prisma

- `npx prisma generate` – generate client
- `npx prisma migrate dev --name init` – run PostgreSQL migrations
- `npx prisma db seed` – seed demo user (`demo@example.com` / `password123`)

## Environment variables

See project root `.env.example` for required keys. Timeouts can be tuned per environment:

- `AI_ATTEMPT_TIMEOUT_MS` – timeout per Gemini attempt (default 25s)
- `AI_TOTAL_TIMEOUT_MS` – total wall-clock limit for hedged attempts (default 35s)
- `AI_HEDGE_DELAY_MS` – delay before firing next attempt (default 5s)
- `AI_MAX_ATTEMPTS` – number of hedged attempts (default 2)

## Key modules

- `services/gemini-service.ts` – wraps Google Generative Language API with hedging, guardrails, and mock fallback.
- `services/log-service.ts` – orchestrates idempotency, persistence, and nutrition card enrichment.
- `routes/log.ts` – multer-powered ingestion endpoint returning UI-friendly payloads.
- `routes/debug.ts` – latency probes and manual analysis helpers.
- `routes/dashboard.ts` – summary and target endpoints for the redesigned dashboard.

## Dashboard API

| Endpoint | Notes |
| --- | --- |
| `GET /api/dashboard/summary?period=today|yesterday|thisWeek|lastWeek|custom&from=YYYY-MM-DD&to=YYYY-MM-DD` | Authenticated users only. Returns range metadata, daily calorie totals (with meal-period buckets), macro totals/targets/delta, micronutrient deltas, and `remainingToday`. `from`/`to` are required when `period=custom` and the range is capped at 31 days. |
| `GET /api/dashboard/targets` | Returns the current fixed macro targets. Cached client-side for offline use. |
| `PUT /api/dashboard/targets` | Placeholder that currently responds `501 Not Implemented`. Reserved for user-configurable targets. |

Responses share the `{ ok: boolean }` envelope used across the API. Summary requests are cached per user (`dashboard:{userId}:{from}:{to}`) with a one hour TTL; cache invalidation happens on meal log mutations.

Logs are emitted via Pino; adjust `LOG_LEVEL` or remove `pino-pretty` in production.

## JSONB indexing

After running migrations you can improve lookup performance on aiRaw with:

```sql
CREATE INDEX IF NOT EXISTS "MealLog_aiRaw_gin"
  ON "MealLog" USING GIN ("aiRaw");
```
