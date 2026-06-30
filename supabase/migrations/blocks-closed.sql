-- Phase 5a: slot blocks + closed calendar days
-- Run: supabase db query --linked --file supabase/migrations/blocks-closed.sql

create table if not exists slot_blocks (
  id serial primary key,
  key_pattern text not null,
  reason text,
  blocked_until timestamptz
);

create table if not exists closed_days (
  date date primary key,
  reason text
);

create index if not exists idx_slot_blocks_pattern on slot_blocks (key_pattern);

alter table slot_blocks enable row level security;
alter table closed_days enable row level security;

drop policy if exists "anon read slot_blocks" on slot_blocks;
drop policy if exists "anon read closed_days" on closed_days;

create policy "anon read slot_blocks"
  on slot_blocks for select to anon using (true);

create policy "anon read closed_days"
  on closed_days for select to anon using (true);

revoke insert, update, delete on slot_blocks from anon, authenticated;
revoke insert, update, delete on closed_days from anon, authenticated;
