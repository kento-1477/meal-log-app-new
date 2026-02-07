create table if not exists "AnalyticsEvent" (
  id bigserial primary key,
  "eventName" text not null,
  "sessionId" text,
  "userId" integer references "User"(id) on delete set null,
  "deviceId" text,
  metadata jsonb,
  "createdAt" timestamptz not null default now()
);

create index if not exists "AnalyticsEvent_eventName_createdAt_idx"
  on "AnalyticsEvent" ("eventName", "createdAt" desc);

create index if not exists "AnalyticsEvent_user_event_createdAt_idx"
  on "AnalyticsEvent" ("userId", "eventName", "createdAt" desc);

create index if not exists "AnalyticsEvent_createdAt_idx"
  on "AnalyticsEvent" ("createdAt" desc);

create or replace view "ReportKpiDaily" as
with base as (
  select
    ("createdAt" at time zone 'UTC')::date as day,
    coalesce(metadata->>'voiceMode', 'balanced') as voice_mode,
    "eventName",
    "userId",
    metadata
  from "AnalyticsEvent"
  where "eventName" like 'report.%'
),
report_generate as (
  select distinct day, voice_mode, "userId"
  from base
  where "eventName" = 'report.generate_requested'
    and "userId" is not null
),
retention as (
  select
    g.day,
    g.voice_mode,
    count(*) as users_generated,
    count(*) filter (
      where exists (
        select 1
        from report_generate n
        where n."userId" = g."userId"
          and n.day = g.day + 1
      )
    ) as users_revisit_24h,
    count(*) filter (
      where exists (
        select 1
        from "MealLog" m
        where m."userId" = g."userId"
          and m."deletedAt" is null
          and m."createdAt" >= (g.day + 1)::timestamptz
          and m."createdAt" < (g.day + 2)::timestamptz
      )
    ) as users_logged_next_day
  from report_generate g
  group by g.day, g.voice_mode
),
counts as (
  select
    day,
    voice_mode,
    count(*) filter (where "eventName" = 'report.generate_requested') as generate_requested,
    count(*) filter (where "eventName" = 'report.generate_completed') as generate_completed,
    count(*) filter (where "eventName" = 'report.generate_completed' and coalesce(metadata->>'status', '') = 'done') as generate_done,
    count(*) filter (where "eventName" = 'report.generate_completed' and coalesce(metadata->>'status', '') = 'failed') as generate_failed,
    count(*) filter (where "eventName" = 'report.shared') as shared,
    count(*) filter (where "eventName" = 'report.voice_mode_switched') as voice_switched,
    count(*) filter (where "eventName" = 'report.details_expanded') as details_expanded
  from base
  group by day, voice_mode
)
select
  c.day,
  c.voice_mode,
  c.generate_requested,
  c.generate_completed,
  c.generate_done,
  c.generate_failed,
  c.shared,
  c.voice_switched,
  c.details_expanded,
  coalesce(r.users_generated, 0) as users_generated,
  coalesce(r.users_revisit_24h, 0) as users_revisit_24h,
  coalesce(r.users_logged_next_day, 0) as users_logged_next_day,
  case when coalesce(r.users_generated, 0) > 0
    then round((r.users_revisit_24h::numeric / r.users_generated::numeric) * 100, 2)
    else 0
  end as revisit_24h_rate,
  case when coalesce(r.users_generated, 0) > 0
    then round((r.users_logged_next_day::numeric / r.users_generated::numeric) * 100, 2)
    else 0
  end as next_day_log_rate,
  case when c.generate_requested > 0
    then round((c.shared::numeric / c.generate_requested::numeric) * 100, 2)
    else 0
  end as share_rate,
  case when c.generate_requested > 0
    then round((c.voice_switched::numeric / c.generate_requested::numeric) * 100, 2)
    else 0
  end as regenerate_rate
from counts c
left join retention r
  on r.day = c.day
 and r.voice_mode = c.voice_mode;

create or replace view "ReportTimezoneKpiDaily" as
with completed as (
  select
    ("createdAt" at time zone 'UTC')::date as day,
    coalesce(metadata->>'timezone', 'unknown') as timezone,
    coalesce(metadata->>'status', 'unknown') as status
  from "AnalyticsEvent"
  where "eventName" = 'report.generate_completed'
)
select
  day,
  timezone,
  count(*) as total,
  count(*) filter (where status = 'failed') as failed,
  case when count(*) > 0
    then round((count(*) filter (where status = 'failed'))::numeric / count(*)::numeric * 100, 2)
    else 0
  end as failed_rate,
  count(*) filter (where timezone <> 'Asia/Tokyo') as non_jst_total,
  count(*) filter (where timezone <> 'Asia/Tokyo' and status = 'failed') as non_jst_failed
from completed
group by day, timezone;
