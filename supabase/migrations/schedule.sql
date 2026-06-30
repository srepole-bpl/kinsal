-- Phase 2: editable studio schedule (days, slots, timezone)
-- Run: supabase db query --linked --file supabase/migrations/schedule.sql

create table if not exists studio_settings (
  id       int primary key default 1,
  timezone text not null default 'America/New_York'
);

insert into studio_settings (id, timezone) values (1, 'America/New_York')
on conflict (id) do nothing;

create table if not exists studio_days (
  weekday    text primary key,
  sort_order int  not null
);

insert into studio_days (weekday, sort_order) values
  ('Tuesday',   0),
  ('Thursday',  1),
  ('Saturday',  2),
  ('Sunday',    3)
on conflict (weekday) do nothing;

create table if not exists schedule_slots (
  id                   text primary key,
  label                text not null,
  start_hour           int  not null,
  end_hour             int  not null,
  open_offset_minutes  int  not null default -120,
  close_offset_minutes int  not null default -60,
  sort_order           int  not null default 0,
  constraint schedule_slots_hours_check check (start_hour >= 0 and end_hour <= 24 and start_hour < end_hour)
);

insert into schedule_slots (id, label, start_hour, end_hour, open_offset_minutes, close_offset_minutes, sort_order) values
  ('am', 'morning', 9,  13, -120, -60, 0),
  ('pm', 'evening', 16, 20, -120, -60, 1)
on conflict (id) do nothing;

alter table studio_settings enable row level security;
alter table studio_days enable row level security;
alter table schedule_slots enable row level security;

drop policy if exists "anon read studio_settings" on studio_settings;
create policy "anon read studio_settings"
  on studio_settings for select to anon, authenticated using (true);

drop policy if exists "anon read studio_days" on studio_days;
create policy "anon read studio_days"
  on studio_days for select to anon, authenticated using (true);

drop policy if exists "anon read schedule_slots" on schedule_slots;
create policy "anon read schedule_slots"
  on schedule_slots for select to anon, authenticated using (true);
