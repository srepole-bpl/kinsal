-- Phase 5c: server audit log + instructor PIN storage
-- Run: supabase db query --linked --file supabase/migrations/audit-log.sql

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (actor in ('instructor', 'system', 'student')),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on audit_log (created_at desc);

alter table audit_log enable row level security;
revoke all on audit_log from anon, authenticated;

create table if not exists instructor_secrets (
  id int primary key default 1,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table instructor_secrets enable row level security;
revoke all on instructor_secrets from anon, authenticated;
