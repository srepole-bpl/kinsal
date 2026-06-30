-- Phase 4b: track reminder emails sent per reservation (idempotency for send-reminders cron)
-- Run: supabase db query --linked --file supabase/migrations/reminders.sql

alter table reservations
  add column if not exists reminder_sent_at timestamptz;

create index if not exists idx_reservations_reminder_pending
  on reservations (reminder_sent_at)
  where reminder_sent_at is null;
