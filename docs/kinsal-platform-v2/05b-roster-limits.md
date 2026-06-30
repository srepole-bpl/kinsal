# Phase 5b: Roster CSV + booking limits + no-show block

## Status: Pending

## Overview

CSV import/export for roster and reservations, configurable weekly booking cap per student, and automatic booking block after repeated no-shows (cleared by instructor). Integrates with existing `release-noshows` cron.

## Prerequisites

- Phase 5a complete (recommended)
- Existing `students` table and `release-noshows` function ✅

## Planned Changes

- [ ] Add columns: `students.booking_blocked_until`, `students.no_show_count`, `studio_settings.max_bookings_per_week`, `studio_settings.no_show_threshold`
- [ ] Extend `admin-action`: `importRoster` (CSV parse), `exportRoster`, `exportBookings`
- [ ] Extend `manage-booking`: enforce weekly cap and `booking_blocked_until` on book
- [ ] Update `release-noshows`: increment no-show count; set block when threshold reached
- [ ] Instructor UI: roster import (file upload), export buttons, clear block toggle per student
- [ ] Settings: max bookings/week and no-show threshold inputs

## Target Implementation Shape

**Weekly cap check**

```typescript
const weekStart = startOfWeek(bookingDate, { timezone });
const count = await countReservationsForStudentInWeek(db, studentId, weekStart);
if (count >= settings.max_bookings_per_week) return json({ error: "weekly limit reached" }, 403);
```

**CSV import**

```typescript
// Columns: name, email (header row optional)
// Duplicate email → skip or error per row; sanitize email lowercase
// admin-action importRoster: { token, csv: string }
```

**No-show block**

```typescript
// release-noshows marks absent students
// if no_show_count >= threshold → booking_blocked_until = far future or flag
// admin clearNoShowBlock: { token, studentId }
```

## Files Touched

- `supabase/migrations/roster-limits.sql` (new)
- `supabase/functions/admin-action/index.ts`
- `supabase/functions/manage-booking/index.ts`
- `supabase/functions/release-noshows/index.ts`
- `index.html`

## Verification Checklist

- [ ] CSV import adds 3 students; duplicate email rejected with message
- [ ] Export roster downloads valid CSV with name, email
- [ ] Export bookings includes day, slot, resource, student name
- [ ] Student at weekly cap cannot book additional slot same week
- [ ] After N no-shows, student blocked until instructor clears
- [ ] `release-noshows` cron still runs without error

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [05a-blocks-closed-days.md](./05a-blocks-closed-days.md) · ↑ [05-phase5-overview.md](./05-phase5-overview.md) · → [05c-audit-pin.md](./05c-audit-pin.md)
