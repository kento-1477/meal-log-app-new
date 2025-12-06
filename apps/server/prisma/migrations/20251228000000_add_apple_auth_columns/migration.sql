-- Add Sign in with Apple columns; safe to run multiple times.
alter table "User"
  add column if not exists "appleSub" text unique,
  add column if not exists "appleEmail" text,
  add column if not exists "appleLinkedAt" timestamptz;
