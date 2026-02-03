# AI Model Routing and Fallback (Gemini)

## Why this document exists

We had a production incident where:

- primary model returned `429` (quota exceeded), then
- fallback model returned `404` (model not found),
- and image analysis failed end-to-end.

This page defines the expected model-routing behavior and the operational runbook.

## Scope

This document covers the Supabase Edge Function path used by mobile meal analysis:

- `apps/mobile/src/services/api.ts` -> `POST /log`
- `supabase/functions/meal-log/index.ts` (`handleCreateLog` -> `processMealLog` -> `analyzeMeal`)

## Routing logic (current)

`analyzeMeal` builds the model list in this priority:

1. `GEMINI_MODEL_CHAIN` (comma-separated, highest priority)
2. else: `GEMINI_PRIMARY_MODEL` + `GEMINI_FALLBACK_MODELS` + legacy `GEMINI_FALLBACK_MODEL`

Other routing controls:

- `GEMINI_FALLBACK_STRATEGY` (default: `any`)
  - `any`: always try next model on failure
  - `quota`: only fallback on quota/rate-limit errors
  - `quota_or_timeout`: fallback on quota/rate-limit/timeout
- `GEMINI_TEXT_ONLY_MODELS`: models that should not receive image parts
- `GEMINI_TIMEOUT_MS`: per-attempt timeout

Additional retry behavior:

- If a model returns overloaded/unavailable (`503` patterns), it retries with short backoff before moving on.

## Recommended production baseline

Use models that are confirmed available for your API key and API version.

Current safe baseline (from incident follow-up):

- `GEMINI_MODEL_CHAIN=models/gemini-2.5-flash,models/gemini-2.5-flash-lite`
- `GEMINI_FALLBACK_STRATEGY=any`

Do **not** leave deprecated or unavailable model IDs in the chain (example: `models/gemini-1.5-flash` returned `404` in our environment).

## Runbook

### 1) List models available to this API key

```bash
curl -sS "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}" \
  | jq -r '.models[] | select((.supportedGenerationMethods // []) | index("generateContent")) | .name' \
  | sort
```

### 2) Smoke-test candidate models

```bash
for m in models/gemini-2.5-flash models/gemini-2.5-flash-lite; do
  code=$(curl -sS -o /tmp/gemini_${m##*/}.json -w "%{http_code}" \
    "https://generativelanguage.googleapis.com/v1beta/${m}:generateContent?key=${GEMINI_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{"contents":[{"parts":[{"text":"ping"}]}]}' )
  msg=$(jq -r '.error.message // "ok"' /tmp/gemini_${m##*/}.json)
  echo "$m => HTTP $code | $msg"
done
```

### 3) Update Supabase secret and deploy

```bash
supabase secrets set GEMINI_MODEL_CHAIN="models/gemini-2.5-flash,models/gemini-2.5-flash-lite" --project-ref ushkrapyubwrrjfuzpla
supabase secrets set GEMINI_FALLBACK_STRATEGY="any" --project-ref ushkrapyubwrrjfuzpla
supabase functions deploy meal-log --project-ref ushkrapyubwrrjfuzpla
```

## Error mapping quick reference

- `429` quota/rate-limit -> `AI_UPSTREAM_QUOTA` (retry later / upgrade quota)
- `404` model not found -> `MODEL_NOT_FOUND` (fix model chain immediately)
- `503` overloaded -> `AI_OVERLOADED` (temporary, auto-retry + fallback)
- timeout/abort -> `AI_TIMEOUT`

## Operational notes

- Supabase secrets are typically not re-readable in plain text; treat them as write-only. Keep intended values documented here.
- Keep `.env.example` and this document aligned with real production defaults.
- Re-validate model availability whenever changing API key, region, or Gemini plan.
