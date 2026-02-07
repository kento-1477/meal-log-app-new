# AGENTS

## Hotspot Change Gate

Applies when touching any of:
- apps/mobile/app/report.tsx
- apps/mobile/app/(tabs)/chat.tsx
- supabase/functions/meal-log/index.ts
- apps/mobile/src/services/api.ts

Required in PR description:
1) Repro steps (confirm failure before fix)
2) Regression checks:
   - Immediate done response state transition
   - `streakDays` old/new compatibility
   - Cancel flow double-execution conflicts
3) Rollback note (UI / Edge / DB scope)

Minimum checks before review:
- npm run lint
- npm run test -- report chat (if tests exist)
- For Edge function changes, run one local manual repro
