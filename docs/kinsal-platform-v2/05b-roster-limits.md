# Phase 5b: Roster CSV + booking limits + no-show block

## Status: ✅ Complete

## Overview

CSV import/export for roster and reservations, configurable weekly booking cap per student, and automatic booking block after repeated no-shows (cleared by instructor). Integrates with existing `release-noshows` cron.

## Planned Changes

- [x] Add columns: `students.booking_blocked_until`, `students.no_show_count`, `studio_settings.max_bookings_per_week`, `studio_settings.no_show_threshold`
- [x] Extend `admin-action`: `importRoster` (CSV parse), `exportRoster`, `exportBookings`
- [x] Extend `manage-booking`: enforce weekly cap and `booking_blocked_until` on book
- [x] Update `release-noshows`: increment no-show count; set block when threshold reached
- [x] Instructor UI: roster import (file upload), export buttons, clear block toggle per student
- [x] Settings: max bookings/week and no-show threshold inputs

## Implementation Notes

**Weekly cap:** Counts active reservations per student (scoped by Monday weekly reset). Default max: 4.

**No-show block:** `release-noshows` increments `students.no_show_count` when a no-show is released. At threshold (default 3), sets `booking_blocked_until` to far future. Instructor clears via **Clear block** on roster row.

**CSV import:** `name,email` columns; header row optional; duplicate emails skipped with message.

**Settings → booking limits:** max bookings/week (1–14), no-show threshold (1–20).

**Deploy:**
```bash
supabase db query --linked --file supabase/migrations/roster-limits.sql
supabase functions deploy manage-booking --use-api
supabase functions deploy admin-action --use-api
supabase functions deploy release-noshows --no-verify-jwt --use-api
```

## Navigation

← [05a-blocks-closed-days.md](./05a-blocks-closed-days.md) · ↑ [05-phase5-overview.md](./05-phase5-overview.md) · → [05c-audit-pin.md](./05c-audit-pin.md)
