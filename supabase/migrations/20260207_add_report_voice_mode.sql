alter table "UserReportPreference"
  add column if not exists "voiceMode" text not null default 'balanced';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'UserReportPreference_voiceMode_check'
  ) then
    alter table "UserReportPreference"
      add constraint "UserReportPreference_voiceMode_check"
      check ("voiceMode" in ('gentle', 'balanced', 'sharp'));
  end if;
end $$;
