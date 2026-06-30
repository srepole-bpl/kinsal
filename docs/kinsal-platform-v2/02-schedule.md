# Phase 2: Editable schedule

## Status: In Progress

## Overview

Move hardcoded `DAYS`, `SLOTS`, and `America/New_York` from `index.html` and `manage-booking/index.ts` into database tables. Instructor edits studio days, slot times, and booking window offsets from Settings; server enforces windows using configured timezone.

## Prerequisites

- Phase 1 complete: resources/rooms live; student grid uses DB-backed resources

## Planned Changes

- [x] Add `supabase/migrations/schedule.sql` (`studio_days`, `schedule_slots`, `studio_settings`)
- [x] Seed current schedule: Tue/Thu/Sat/Sun; `am` 9–13, `pm` 16–20; offsets -120/-60; timezone `America/New_York`
- [x] Add `_shared/schedule.ts` (load schedule, validate overlaps, `isBookingOpen`)
- [x] Update `manage-booking/index.ts`: replace hardcoded schedule with DB reads
- [x] Extend `admin-action`: `getSchedule`, `saveSchedule`
- [x] Update `index.html`: `loadSchedule()`; dynamic day tabs; Settings schedule panel
- [ ] Run migration + deploy functions *(requires `supabase login`)*
- [ ] Push `index.html` to GitHub

## Target Implementation Shape

**Tables**

```sql
create table studio_settings (
  id int primary key default 1,
  timezone text not null default 'America/New_York'
);

create table studio_days (
  weekday text primary key,  -- Tuesday, Thursday, ...
  sort_order int not null
);

create table schedule_slots (
  id text primary key,       -- am, pm
  label text not null,
  start_hour int not null,
  end_hour int not null,
  open_offset_minutes int not null default -120,
  close_offset_minutes int not null default -60,
  sort_order int not null default 0
);
```

**Server booking window** (from PRD + existing `manage-booking` logic):

```typescript
// open = slotStart + open_offset_minutes (e.g. 2h before start)
// close = slotEnd + close_offset_minutes (e.g. 1h before end)
// evaluate in studio_settings.timezone via Temporal or date-fns-tz equivalent
```

**admin-action**

```typescript
// saveSchedule: { days: StudioDay[], slots: ScheduleSlot[], timezone: string }
// reject overlapping slots (same day coverage) and invalid hour ranges
```

## Files Touched

- `supabase/migrations/schedule.sql` (new)
- `supabase/functions/_shared/schedule.ts` (new)
- `supabase/functions/_shared/types/domain.ts` (ScheduleSlot, StudioDay, StudioSettings)
- `supabase/functions/manage-booking/index.ts`
- `supabase/functions/admin-action/index.ts`
- `index.html`

## Verification Checklist

- [ ] Grid day tabs match `studio_days` after save (e.g. swap Tuesday → Wednesday)
- [ ] Slot labels and times render from `schedule_slots`
- [ ] Book outside window returns 403/400 with clear message (server-side)
- [ ] Overlapping slot save rejected in Settings
- [ ] Timezone change affects window calculation (test with offset near midnight)
- [ ] `supabase functions deploy manage-booking admin-action` succeeds

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [01d-ui-instructor-settings.md](./01d-ui-instructor-settings.md) · ↑ [00-index.md](./00-index.md) · → [03-student-auth.md](./03-student-auth.md)
