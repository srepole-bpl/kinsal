-- ============================================================================
-- KINSAL — SECURITY SETUP (ready to run)
-- Run in Supabase → SQL Editor AFTER all 4 edge functions are deployed.
-- CRON_SECRET below must match the CRON_SECRET edge-function secret exactly.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table reservations
  add constraint reservations_key_unique unique (key);

alter table no_shows
  add column if not exists released_at timestamptz;

create table if not exists auth_throttle (
  id           int primary key,
  fail_count   int default 0,
  window_start timestamptz,
  locked_until timestamptz
);
insert into auth_throttle (id, fail_count) values (1, 0)
  on conflict (id) do nothing;

alter table auth_throttle enable row level security;
revoke all on auth_throttle from anon, authenticated;

drop policy if exists "anon can manage no_shows"     on no_shows;
drop policy if exists "anon no_shows"                on no_shows;
drop policy if exists "anon can manage reservations" on reservations;
drop policy if exists "anon reservations"            on reservations;
drop policy if exists "anon can manage settings"     on settings;
drop policy if exists "anon settings"                on settings;
drop policy if exists "anon can manage students"     on students;
drop policy if exists "email lookup only"            on students;
drop policy if exists "public can read students"     on students;
drop policy if exists "anon can manage waitlists"    on waitlists;
drop policy if exists "anon waitlists"               on waitlists;

create policy "anon read reservations"
  on reservations for select to anon using (true);

create policy "anon read waitlists"
  on waitlists for select to anon using (true);

create policy "anon read no_shows"
  on no_shows for select to anon using (true);

revoke select on students from anon;
revoke all on settings from anon;

create or replace view student_directory as
  select id, name from students;

grant select on student_directory to anon, authenticated;

create index if not exists idx_reservations_key        on reservations (key);
create index if not exists idx_reservations_student     on reservations (student_id);
create index if not exists idx_waitlists_key_position   on waitlists (key, position);
create index if not exists idx_no_shows_student         on no_shows (student_id);
create index if not exists idx_no_shows_released        on no_shows (released_at, logged_at);

select cron.schedule(
  'kinsal-weekly-reset',
  '0 4 * * 1',
  $$
    delete from reservations;
    delete from waitlists;
  $$
);

select cron.schedule(
  'kinsal-release-noshows',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := 'https://dhottawheezvotadbsqq.supabase.co/functions/v1/release-noshows',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'o1ZscBOKA6GWFwQ4VjxaRPN9Yv2IT7nM5h3DqUlHbzftrpXS'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Phase 4b: day-before reminder emails (runs daily ~10am Eastern / 14:00 UTC)
select cron.unschedule('kinsal-send-reminders')
  where exists (select 1 from cron.job where jobname = 'kinsal-send-reminders');

select cron.schedule(
  'kinsal-send-reminders',
  '0 14 * * *',
  $$
    select net.http_post(
      url     := 'https://dhottawheezvotadbsqq.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'o1ZscBOKA6GWFwQ4VjxaRPN9Yv2IT7nM5h3DqUlHbzftrpXS'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Phase 8: instructor slot roster updates (T-30 + midpoint, only if changed)
select cron.unschedule('kinsal-instructor-updates')
  where exists (select 1 from cron.job where jobname = 'kinsal-instructor-updates');

select cron.schedule(
  'kinsal-instructor-updates',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://dhottawheezvotadbsqq.supabase.co/functions/v1/send-instructor-updates',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'o1ZscBOKA6GWFwQ4VjxaRPN9Yv2IT7nM5h3DqUlHbzftrpXS'
      ),
      body    := '{}'::jsonb
    );
  $$
);
