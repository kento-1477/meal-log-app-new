-- Add ingest status tracking and metadata for async UX improvements.
alter table "IngestRequest" add column if not exists "status" text not null default 'queued';
alter table "IngestRequest" add column if not exists "errorCode" text;
alter table "IngestRequest" add column if not exists "errorCategory" text;
alter table "IngestRequest" add column if not exists "userMessage" text;
alter table "IngestRequest" add column if not exists "debugMessage" text;
alter table "IngestRequest" add column if not exists "nextCheckAt" timestamptz;
alter table "IngestRequest" add column if not exists "deadlineAt" timestamptz;
alter table "IngestRequest" add column if not exists "attempts" integer not null default 0;
alter table "IngestRequest" add column if not exists "modelAttempts" integer not null default 0;
alter table "IngestRequest" add column if not exists "inputHash" text;
alter table "IngestRequest" add column if not exists "inputHashBucket" date;
alter table "IngestRequest" add column if not exists "promptVersion" text;
alter table "IngestRequest" add column if not exists "modelVersion" text;
alter table "IngestRequest" add column if not exists "appVersion" text;
alter table "IngestRequest" add column if not exists "startedAt" timestamptz;
alter table "IngestRequest" add column if not exists "finishedAt" timestamptz;

alter table "IngestRequest"
  add constraint "IngestRequest_status_check"
  check ("status" in ('queued', 'processing', 'done', 'failed', 'deferred'));

alter table "IngestRequest"
  add constraint "IngestRequest_errorCategory_check"
  check ("errorCategory" in ('waitable', 'actionable'));

create index if not exists "IngestRequest_status_nextCheck_idx"
  on "IngestRequest" ("status", "nextCheckAt");

create index if not exists "IngestRequest_user_status_created_idx"
  on "IngestRequest" ("userId", "status", "createdAt" desc);

create index if not exists "IngestRequest_inputHash_idx"
  on "IngestRequest" ("inputHash");

create index if not exists "IngestRequest_user_inputHash_bucket_idx"
  on "IngestRequest" ("userId", "inputHash", "inputHashBucket");

update "IngestRequest"
set "status" = case when "logId" is not null then 'done' else 'processing' end,
    "finishedAt" = case when "logId" is not null then now() else null end
where "status" = 'queued';
