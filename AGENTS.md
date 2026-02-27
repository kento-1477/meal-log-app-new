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
- npm run test:edge (for Edge function changes)
- For Edge function changes, run one local manual repro

## Localization Change Gate

Applies when touching any of:
- apps/mobile/src/i18n/**
- apps/mobile/tests/localization.test.ts
- apps/mobile/app/settings/language.tsx
- apps/mobile/src/hooks/useLocaleBootstrap.ts

Required in PR description:
1) `_docs/features/localization-qa-checklist.md` の実施有無と結果

Minimum checks before review:
- npm run test:localization --workspace apps/mobile
