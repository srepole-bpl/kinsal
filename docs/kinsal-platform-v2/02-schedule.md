# Phase 2: Editable schedule

## Status: Complete

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
- [x] Run migration + deploy functions
- [x] Push `index.html` to GitHub

## Verification Checklist

- [x] Schedule tables seeded (am 9–13, pm 16–20, America/New_York)
- [x] `supabase functions deploy manage-booking admin-action` succeeds
- [ ] Grid day tabs match `studio_days` after save (manual smoke test in Settings)
- [ ] Book outside window returns 403 (manual smoke test)
- [ ] Overlapping slot save rejected in Settings (manual smoke test)

## Implementation Notes

- Migration applied: `supabase db query --linked --file supabase/migrations/schedule.sql`
- Functions deployed with `schedule.ts` shared module
- Frontend loads schedule via anon read; falls back to hardcoded defaults if tables empty
- Instructor Settings → **schedule** panel: days, slot hours (24h), timezone
- Commit: `4739450`

## Navigation

← [01d-ui-instructor-settings.md](./01d-ui-instructor-settings.md) · ↑ [00-index.md](./00-index.md) · → [03-student-auth.md](./03-student-auth.md)
