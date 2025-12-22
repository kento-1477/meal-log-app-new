-- Track onboarding funnel events for drop-off analysis.
create table if not exists "OnboardingEvent" (
  id uuid primary key default gen_random_uuid(),
  "createdAt" timestamptz not null default now(),
  "eventName" text not null,
  "step" text,
  "sessionId" text not null,
  "userId" bigint,
  "deviceId" text,
  "metadata" jsonb
);

create index if not exists "OnboardingEvent_eventName_createdAt_idx"
  on "OnboardingEvent" ("eventName", "createdAt" desc);

create index if not exists "OnboardingEvent_sessionId_idx"
  on "OnboardingEvent" ("sessionId");

create index if not exists "OnboardingEvent_step_idx"
  on "OnboardingEvent" ("step");
