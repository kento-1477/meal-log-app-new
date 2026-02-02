create table if not exists "UserReportPreference" (
  "userId" integer primary key references "User"("id") on delete cascade,
  "goal" text not null default 'maintain',
  "focusAreas" jsonb not null default '["habit"]'::jsonb,
  "adviceStyle" text not null default 'concrete',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table "UserReportPreference"
  add constraint "UserReportPreference_goal_check"
  check ("goal" in ('cut', 'maintain', 'bulk'));

alter table "UserReportPreference"
  add constraint "UserReportPreference_adviceStyle_check"
  check ("adviceStyle" in ('simple', 'concrete', 'motivational'));

alter table "AiReportRequest"
  add column if not exists "preferenceSnapshot" jsonb;
