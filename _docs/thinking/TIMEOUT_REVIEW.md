# Timeout Review Notes

This memo tracks lessons learned while tuning Gemini call hedging and timeout behaviour.

- Prefer IPv4 endpoints when deploying behind dual-stack networks; v6 DNS resolution added ~300ms median latency in staging. The `GEMINI_FORCE_IPV4=true` flag switches the HTTP agent to v4 only.
- Keep-alive dramatically improves tail latency. The server reuses a single `Agent` instance per model to preserve warmed TLS sessions.
- Hedged requests: delay the second attempt by `AI_HEDGE_DELAY_MS` (default 5s). Shorter delays (<2s) increased call volume without materially improving p95; longer delays (>8s) hurt rescue ability.
- Total timeout should stay <36s. Beyond that we saw mobile clients abandon the request even if the server eventually responded.
- Always log `err.name`, `err.code`, and `err.cause?.code` so we can group failures (DNS, ECONNRESET, etc.).
- Guardrails: when Gemini returns zero or null totals, mark the log as `zeroFloored` and surface the warning in the UI to prompt manual review.
- Retry budget: cap at `AI_MAX_ATTEMPTS` (default 2). Additional attempts rarely succeed and increase cost.
- Wilson fallback: `models/gemini-2.5-pro` works as a rescue; only invoke on the final attempt to reduce expense.
