# Phase 5a: Blocks + closed days

## Status: Pending

## Overview

Allow instructor to block specific resource/slot combinations and mark entire calendar dates as studio closed. Enforce both in `manage-booking` and reflect in student grid (greyed out / hidden).

## Prerequisites

- Phase 2 complete: schedule from DB
- Phase 1 complete: resource ids in reservation keys

## Planned Changes

- [ ] Add `supabase/migrations/blocks-closed.sql` (`slot_blocks`, `closed_days`)
- [ ] Add `_shared/blocks.ts` (isBlocked(key, date), isClosed(date))
- [ ] Extend `admin-action`: `getBlocks`, `saveBlocks`, `getClosedDays`, `saveClosedDays`
- [ ] Update `manage-booking`: reject book if block matches key prefix or closed day
- [ ] Instructor UI: Blocks panel (pick day/slot/resource, reason); Closed days calendar/list
- [ ] Student grid: show blocked rows greyed with reason tooltip; closed days message

## Target Implementation Shape

**slot_blocks**

```sql
create table slot_blocks (
  id serial primary key,
  key_pattern text not null,  -- e.g. Tuesday|am|shimpo or Tuesday|am| (partial)
  reason text,
  blocked_until timestamptz
);
```

**closed_days**

```sql
create table closed_days (
  date date primary key,
  reason text
);
```

**Server check (book)**

```typescript
if (await isClosed(db, bookingDate)) return json({ error: "studio closed" }, 403);
if (await isBlocked(db, key)) return json({ error: "slot blocked" }, 403);
```

## Files Touched

- `supabase/migrations/blocks-closed.sql` (new)
- `supabase/functions/_shared/blocks.ts` (new)
- `supabase/functions/admin-action/index.ts`
- `supabase/functions/manage-booking/index.ts`
- `index.html`

## Verification Checklist

- [ ] Block shimpo Tuesday AM → book returns 403; grid shows blocked state
- [ ] Partial key block (whole Tuesday AM) blocks all resources that slot
- [ ] Closed day 2026-07-04 → no bookings that calendar date
- [ ] Removing block restores reserve button
- [ ] Anon cannot insert into `slot_blocks` (RLS)

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [05-phase5-overview.md](./05-phase5-overview.md) · ↑ [00-index.md](./00-index.md) · → [05b-roster-limits.md](./05b-roster-limits.md)
