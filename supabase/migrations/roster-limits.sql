-- Phase 5b: roster limits, no-show blocking
-- Run: supabase db query --linked --file supabase/migrations/roster-limits.sql

alter table students
  add column if not exists booking_blocked_until timestamptz,
  add column if not exists no_show_count int not null default 0;

alter table studio_settings
  add column if not exists max_bookings_per_week int not null default 4,
  add column if not exists no_show_threshold int not null default 3;

update studio_settings
set max_bookings_per_week = coalesce(max_bookings_per_week, 4),
    no_show_threshold = coalesce(no_show_threshold, 3)
where id = 1;
