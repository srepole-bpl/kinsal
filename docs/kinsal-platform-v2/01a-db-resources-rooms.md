# Phase 1a: Database — rooms, resources, spot_index

## Status: 🟡 In Progress

## Overview

Create `rooms` and `resources` tables, migrate existing `wheels` data, add `spot_index` to `reservations`, and apply RLS so anon can read rooms/resources only. No frontend or edge function changes in this step.

## Prerequisites

- Supabase project linked (`dhottawheezvotadbsqq`)
- v1 `wheels` table populated (shimpo, pacifica, bhr)

## Planned Changes

- [x] Add `supabase/migrations/resources-rooms.sql`
- [ ] Run migration on linked project via `supabase db query --linked --file ...` *(blocked: CLI 401 — run after `supabase login`)*
- [ ] Verify seed data and migrated wheels
- [ ] Verify existing reservation keys still valid (ids unchanged)

## Target Implementation Shape

**`rooms`**

```sql
create table rooms (
  id text primary key,
  label text not null,
  sort_order int not null default 0
);
```

**`resources`**

```sql
create table resources (
  id text primary key,
  room_id text not null references rooms(id),
  label text not null,
  category text not null check (category in (
    'wheel','hand_build_table','clay_prep_table','glaze_table'
  )),
  capacity int not null,
  sort_order int not null default 0,
  constraint resources_capacity_check check (
    (category = 'wheel' and capacity = 1)
    or (category != 'wheel' and capacity between 2 and 5)
  )
);
```

**`reservations`**

```sql
alter table reservations add column if not exists spot_index int;
-- backfill spot_index = 1 for existing rows
create unique index if not exists reservations_key_spot_unique
  on reservations (key, spot_index);
```

**Migration:** `insert into resources ... select from wheels`; seed `main-studio` room.

**RLS:** `create policy "anon read rooms"` / `"anon read resources"` for SELECT only.

## Files Touched

- `supabase/migrations/resources-rooms.sql` (new)

## Verification Checklist

- [ ] `select * from rooms` returns `main-studio`
- [ ] `select id, category, capacity from resources` returns 3 wheels with `category=wheel`, `capacity=1`
- [ ] `select key, spot_index from reservations` shows backfilled spot_index where rows exist
- [ ] Anon REST read works: `GET /rest/v1/resources?select=*`
- [ ] Anon cannot INSERT into `resources` (RLS blocks)

## Implementation Notes

- Migration applied via `supabase db query --linked --file supabase/migrations/resources-rooms.sql`
- Drops `reservations_key_unique` on `key` only; adds unique index on `(key, spot_index)`
- `wheels` table kept for rollback; frontend falls back to `wheels` read if `resources` empty
- Commit: `2c6b7f6`

## Navigation

↑ [01-phase1-overview.md](./01-phase1-overview.md) · → [01b-api-resources-booking.md](./01b-api-resources-booking.md)
