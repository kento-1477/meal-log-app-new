-- Add columns for Sign in with Apple. Safe to run multiple times with IF NOT EXISTS.
alter table "User"
  add column if not exists "appleSub" text unique,
  add column if not exists "appleEmail" text,
  add column if not exists "appleLinkedAt" timestamptz;

-- Backfill helper: ensure email uniqueness still enforced. No data migration here; handle conflicts at app level.

