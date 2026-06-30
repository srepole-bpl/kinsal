-- Phase 6 optional: SMS opt-in on students
-- Run: supabase db query --linked --file supabase/migrations/sms-optional.sql

alter table students
  add column if not exists phone text,
  add column if not exists sms_opt_in boolean not null default false;
