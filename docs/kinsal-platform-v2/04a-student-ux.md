# Phase 4a: Student UX — bookings, waitlist, ICS

## Status: ✅ Complete

## Overview

Add student dashboard views for upcoming reservations and active waitlist entries, a `leave_waitlist` action, and client- or server-generated `.ics` calendar files per booking.

## Prerequisites

- Student identity via email lookup (Phase 3 cancelled; uses `currentStudent.id` from roster lookup)

## Planned Changes

- [x] Add "My bookings" panel in student view: list upcoming keys with day, slot, resource label, category
- [x] Add `leaveWaitlist` to `manage-booking` (remove waitlist row for authenticated student + key)
- [x] Wire leave waitlist button in grid and my-bookings list
- [x] Add `getMyBookings` query (client-side filter or new read endpoint if RLS requires)
- [x] Implement ICS: client-generated from schedule + reservation data, or thin edge endpoint
- [x] Include category label and room in booking display strings

## Implementation Notes

- **My bookings** panel lists reservations + waitlist entries sorted by next studio weekday.
- **ICS** generated client-side with `DTSTART;TZID=` from `studio_settings.timezone`.
- **leave_waitlist** recompacts queue positions after delete (`recompactWaitlist` in `_shared/waitlist.ts`).

## Navigation

← [04-phase4-overview.md](./04-phase4-overview.md) · ↑ [00-index.md](./00-index.md) · → [04b-emails-reminders.md](./04b-emails-reminders.md)
