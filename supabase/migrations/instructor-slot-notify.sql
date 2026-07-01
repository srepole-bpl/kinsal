-- Phase 8: instructor slot-update emails (T-30 + midpoint, only if roster changed)
-- Run: supabase db query --linked --file supabase/migrations/instructor-slot-notify.sql

alter table studio_settings
  add column if not exists instructor_email text,
  add column if not exists instructor_slot_notify_enabled boolean not null default true;

create table if not exists instructor_slot_notify_log (
  occurrence_key text not null,
  notify_window text not null check (notify_window in ('pre_start', 'midpoint')),
  content_hash text not null,
  sent_at timestamptz not null default now(),
  primary key (occurrence_key, notify_window)
);

alter table instructor_slot_notify_log enable row level security;
revoke all on instructor_slot_notify_log from anon, authenticated;
