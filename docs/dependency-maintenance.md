# Dependency Maintenance Plan

## Current status
- GitHub Dependabot is tracking **10 alerts** on `main` (8 高, 2 中). Most come from outdated React Native / Expo transitive deps.
- `npm audit` (2025-11-20) shows high severity issues in legacy Expo CLI packages that require major upgrades.

## Recommended workflow
1. **Weekly:** run `npm outdated` and `npm audit` from repo root.
2. **Per alert:** create a focused branch that bumps only the affected workspace (mobile/server/shared) to the next compatible version.
3. **Testing expectations:**
   - `npm run build --workspace apps/server`
   - `npm run test --workspace apps/mobile`
   - Expo client smoke test (login → log meal → favorite) on both iOS and Android simulators.
4. **Rollout:** merge via PR with Dependabot alert linked. Tag commits in `docs/security-remediation-plan.md`.

## Upcoming upgrades
| Package | Workspace | Current | Target | Notes |
|---------|-----------|---------|--------|-------|
| Expo SDK | apps/mobile | 51.x | 52.x | required to pick up patched `tar` & `sharp`. Follow Expo upgrade guide. |
| `@expo/cli` | apps/mobile | 0.17.x | latest | audit flagged tar vulnerability. Update along with Expo SDK. |
| `esbuild` | root | 0.21.x | latest | ensures M-series native binary availability and CVE fixes. |
| `express-session` | apps/server | 1.18.1 | >=1.18.2 | pending advisory GHSA-pprp-c4pm-6g68. Monitor release. |

Keep this file updated whenever alerts are closed or new ones appear.
