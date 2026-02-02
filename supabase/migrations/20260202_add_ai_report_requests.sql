create table if not exists "AiReportRequest" (
  "id" uuid primary key default gen_random_uuid(),
  "userId" integer not null references "User"("id") on delete cascade,
  "period" text not null,
  "locale" text,
  "rangeStart" date not null,
  "rangeEnd" date not null,
  "timezone" text not null,
  "status" text not null default 'queued',
  "requestKey" text not null,
  "attempts" integer not null default 0,
  "nextAttemptAt" timestamptz,
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  "errorCode" text,
  "errorMessage" text,
  "modelVersion" text,
  "modelAttempts" integer not null default 0,
  "report" jsonb,
  "usageSnapshot" jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table "AiReportRequest"
  add constraint "AiReportRequest_status_check"
  check ("status" in ('queued', 'processing', 'done', 'failed', 'canceled'));

alter table "AiReportRequest"
  add constraint "AiReportRequest_period_check"
  check ("period" in ('daily', 'weekly', 'monthly'));

create index if not exists "AiReportRequest_user_status_created_idx"
  on "AiReportRequest" ("userId", "status", "createdAt" desc);

create index if not exists "AiReportRequest_user_period_range_idx"
  on "AiReportRequest" ("userId", "period", "rangeStart", "rangeEnd", "createdAt" desc);

create index if not exists "AiReportRequest_requestKey_idx"
  on "AiReportRequest" ("requestKey");
