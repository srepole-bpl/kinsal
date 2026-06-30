-- Phase 1a: rooms, resources, spot_index — migrate from wheels
-- Run: supabase db query --linked --file supabase/migrations/resources-rooms.sql

-- ── Rooms ────────────────────────────────────────────────────────────────────
create table if not exists rooms (
  id         text primary key,
  label      text not null,
  sort_order int  not null default 0
);

insert into rooms (id, label, sort_order) values
  ('main-studio', 'Main studio', 0)
on conflict (id) do nothing;

-- ── Resources ──────────────────────────────────────────────────────────────────
create table if not exists resources (
  id         text primary key,
  room_id    text not null references rooms(id) on delete restrict,
  label      text not null,
  category   text not null,
  capacity   int  not null,
  sort_order int  not null default 0,
  constraint resources_category_check check (
    category in ('wheel', 'hand_build_table', 'clay_prep_table', 'glaze_table')
  ),
  constraint resources_capacity_check check (
    (category = 'wheel' and capacity = 1)
    or (category != 'wheel' and capacity between 2 and 5)
  )
);

-- Migrate wheels → resources (preserve stable ids for reservation keys)
insert into resources (id, room_id, label, category, capacity, sort_order)
select id, 'main-studio', label, 'wheel', 1, sort_order
from wheels
on conflict (id) do nothing;

-- Fallback seed if wheels table empty
insert into resources (id, room_id, label, category, capacity, sort_order) values
  ('shimpo',   'main-studio', 'Shimpo',   'wheel', 1, 0),
  ('pacifica', 'main-studio', 'Pacifica', 'wheel', 1, 1),
  ('bhr',      'main-studio', 'BHR',      'wheel', 1, 2)
on conflict (id) do nothing;

-- ── Reservations: multi-seat support ─────────────────────────────────────────
alter table reservations add column if not exists spot_index int;

update reservations set spot_index = 1 where spot_index is null;

alter table reservations alter column spot_index set default 1;
alter table reservations alter column spot_index set not null;

-- Replace single-key unique with (key, spot_index) for table capacity
alter table reservations drop constraint if exists reservations_key_unique;

drop index if exists reservations_key_spot_unique;
create unique index reservations_key_spot_unique on reservations (key, spot_index);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table rooms enable row level security;
alter table resources enable row level security;

drop policy if exists "anon read rooms" on rooms;
create policy "anon read rooms"
  on rooms for select to anon, authenticated using (true);

drop policy if exists "anon read resources" on resources;
create policy "anon read resources"
  on resources for select to anon, authenticated using (true);

-- Writes only via service role in edge functions (no anon/authenticated policies).
-- wheels table kept for rollback; frontend/API will switch to resources in Phase 1b.
