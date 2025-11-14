## Meal Log App – Security Remediation Plan

> **Owner:** TBD  
> **Last updated:** 2025-11-14  
> **Goal:** Address high-risk security gaps identified in the recent assessment.

---

### Phase 1 – Contain Secret Leakage & Establish Baseline

- [ ] **Rotate leaked secrets**
  - [ ] Rotate Supabase database password (or recreate instance).
  - [ ] Rotate `SESSION_SECRET` and any derivatives in every deployed environment.
- [ ] **Purge leaked values from repo & docs**
  - [x] Replace sensitive entries in `.env.example`, `.env.local` and docs with placeholders.
  - [ ] Use history-rewrite tooling to remove old secrets from git history.
  - [x] Document the new secret-management policy (location, rotation process).

### Phase 2 – Platform Hardening & Abuse Prevention

- [ ] **In-app purchase verification**
  - [x] Enforce `IAP_TEST_MODE=false` for production builds and block startup if still true.
  - [x] Require admin override headers to access test mode endpoints.
  - [x] Always hit Apple/Google verification endpoints before issuing entitlements (offline mode only for automated tests).
  - [x] Add automated tests ensuring forged receipts are rejected.
- [ ] **Session fixation defense**
  - [x] Regenerate sessions on successful `/api/login` & `/api/register`.
  - [x] Destroy sessions on failure/error paths.
  - [x] Add regression tests to confirm session IDs rotate post-login.
- [ ] **Trusted proxy & rate-limit resilience**
  - [x] Disable `trust proxy` by default; allow explicit safe-list via env.
  - [x] Update rate limiters to fallback to user-based quotas.
  - [x] Enhance referral-fraud fingerprinting with durable device IDs.
- [ ] **Durable session storage**
  - [x] Introduce Redis/Postgres-backed session store with TTLs.
  - [ ] Configure cookie security flags appropriate for prod/dev.
  - [x] Monitor total active sessions and enforce cleanup.
- [ ] **Demo credential safety**
  - [x] Gate `prisma db seed` demo user behind env guard.
  - [x] Generate random passwords for any seeded accounts.
  - [x] Audit existing databases for leftover demo accounts (added audit script).

### Phase 3 – Verification & Ongoing Safeguards

- [ ] **Testing & validation**
  - [ ] Re-run unit/integration tests for auth, IAP, referral, and sessions.
  - [ ] Perform manual abuse tests (fake receipts, session hijack attempts).
- [ ] **Monitoring & education**
  - [x] Add automatic secret-scanning to CI (e.g., trufflehog).
  - [ ] Update README/Agent docs with new security expectations.
  - [ ] Brief the team on new procedures and emergency rotation steps.

---

**How to use this plan**
1. Work phase-by-phase; do not start the next phase until all checkboxes above are marked.
2. After finishing a task, mark it `[x]` and reference the supporting PR/commit.
3. Keep this document updated so reviewers can see progress at a glance.
