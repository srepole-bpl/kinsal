-- Phase 3: link students to Supabase Auth users (magic link login)
-- Run: supabase db query --linked --file supabase/migrations/student-auth.sql

alter table students
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists idx_students_auth_user_id on students (auth_user_id);

-- Writes only via service role in edge functions (no new anon policies).
