-- ============================================================================
-- KINSAL — SECURITY SETUP
-- Run this in Supabase → SQL Editor AFTER deploying the four edge functions.
-- Read the comments. Two placeholders must be replaced before running the
-- cron section (search for REPLACE_).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS (enable these in Database → Extensions if not already on)
--    pg_cron  → scheduled jobs
--    pg_net   → lets a cron job call an edge function over HTTP
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- 1. CONSTRAINTS & COLUMNS the functions rely on
-- ----------------------------------------------------------------------------

-- One row per wheel-slot. Makes booking atomic: a second insert on the same
-- key fails instead of double-booking. If this errors because duplicates
-- already exist, clear reservations first (manual reset) then re-run.
alter table reservations
  add constraint reservations_key_unique unique (key);

-- release-noshows marks records released instead of re-processing them.
alter table no_shows
  add column if not exists released_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. PIN BRUTE-FORCE THROTTLE (single-row counter, read/written by verify-pin)
-- ----------------------------------------------------------------------------
create table if not exists auth_throttle (
  id           int primary key,
  fail_count   int default 0,
  window_start timestamptz,
  locked_until timestamptz
);
insert into auth_throttle (id, fail_count) values (1, 0)
  on conflict (id) do nothing;

alter table auth_throttle enable row level security;
-- No policies = no anon/authenticated access. Only the service role
-- (inside verify-pin) can touch it.
revoke all on auth_throttle from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. DROP THE WIDE-OPEN POLICIES
--    Every one of these was `ALL / true / public` — i.e. anon could read,
--    insert, update, and delete every row. That is what we are removing.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 4. NEW POLICIES — READ-ONLY for anon, NO writes from the browser.
--    All writes now happen inside edge functions using the service role,
--    which bypasses RLS. So the browser never needs write access again.
-- ----------------------------------------------------------------------------

-- reservations / waitlists / no_shows: the UI needs to READ these to render
-- the grid and each student's own stats. Reads expose student_id (an opaque
-- id) but never names or emails — those come from the view below.
create policy "anon read reservations"
  on reservations for select to anon using (true);

create policy "anon read waitlists"
  on waitlists for select to anon using (true);

create policy "anon read no_shows"
  on no_shows for select to anon using (true);

-- students: NO direct anon access at all. Emails must never be reachable with
-- the public anon key. Belt and suspenders alongside RLS:
revoke select on students from anon;

-- settings: no anon access whatsoever (dropping its policies already did this;
-- this makes it explicit).
revoke all on settings from anon;

-- ----------------------------------------------------------------------------
-- 5. NAME-ONLY DIRECTORY VIEW
--    The booking grid shows the NAME of whoever holds a slot, but must not
--    leak emails. This view exposes only id + name. A normal (non
--    security_invoker) view runs with the owner's privileges, so anon can read
--    it even though anon can't read the students table directly.
-- ----------------------------------------------------------------------------
create or replace view student_directory as
  select id, name from students;

grant select on student_directory to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. INDEXES (performance; safe to run repeatedly)
-- ----------------------------------------------------------------------------
create index if not exists idx_reservations_key        on reservations (key);
create index if not exists idx_reservations_student     on reservations (student_id);
create index if not exists idx_waitlists_key_position   on waitlists (key, position);
create index if not exists idx_no_shows_student         on no_shows (student_id);
create index if not exists idx_no_shows_released        on no_shows (released_at, logged_at);

-- ----------------------------------------------------------------------------
-- 7. CRON JOBS
-- ----------------------------------------------------------------------------

-- 7a. Weekly reset — clears all reservations + waitlists once a week.
--     Schedule is in UTC. '0 4 * * 1' = Monday 04:00 UTC, which is roughly
--     Sunday ~11pm–midnight US Eastern (shifts an hour with daylight saving).
--     Adjust the cron expression if you want a different rollover time.
select cron.schedule(
  'kinsal-weekly-reset',
  '0 4 * * 1',
  $$
    delete from reservations;
    delete from waitlists;
  $$
);

-- 7b. No-show release — every 10 minutes, ask the edge function to release any
--     no-shows older than 30 minutes and promote the waitlist.
--     REPLACE the two placeholders below:
--       REPLACE_PROJECT_REF  → your project ref (dhottawheezvotadbsqq)
--       REPLACE_CRON_SECRET  → the same value you set as the CRON_SECRET
--                              edge-function secret
select cron.schedule(
  'kinsal-release-noshows',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := 'https://REPLACE_PROJECT_REF.supabase.co/functions/v1/release-noshows',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'REPLACE_CRON_SECRET'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- To inspect or remove jobs later:
--   select * from cron.job;
--   select cron.unschedule('kinsal-release-noshows');
