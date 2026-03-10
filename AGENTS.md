# AGENTS

## Hotspot Change Gate

Applies when touching any of:
- apps/mobile/app/report.tsx
- apps/mobile/app/(tabs)/chat.tsx
- supabase/functions/meal-log/index.ts
- apps/mobile/src/services/api.ts
- packages/shared/src/index.ts
- supabase/migrations/**

Required in PR description:
1) Repro steps (confirm failure before fix)
2) Regression checks:
   - Immediate done response state transition
   - `streakDays` old/new compatibility
   - Cancel flow double-execution conflicts
   - Day-boundary (e.g., 4am) and timezone alignment across client/Edge
   - Voice mode and summary date persistence
3) Rollback note (UI / Edge / DB scope)
4) If migration changes, note backward compatibility and rollback procedure
5) `report-release-guard` execution result
   - Contract risks / minimal repro tests / rollback decision

Minimum checks before review:
- npm run lint
- npm run test -- report chat (if tests exist)
- npm run test:edge (for Edge function or migration changes)
- For Edge function changes, run one local manual repro
- Update relevant tests when day-boundary/timezone/voice-summary behavior changes:
  - supabase/functions/meal-log/report-release.test.ts
  - apps/mobile/tests/day-boundary.test.ts
  - apps/mobile/tests/report-ui-v2.test.ts (if UI behavior changed)

## Localization Change Gate

Applies when touching any of:
- apps/mobile/src/i18n/**
- apps/mobile/tests/localization.test.ts
- apps/mobile/app/settings/language.tsx
- apps/mobile/src/hooks/useLocaleBootstrap.ts

Required in PR description:
1) `_docs/features/localization-qa-checklist.md` completion status and result

Minimum checks before review:
- npm run test:localization --workspace apps/mobile
