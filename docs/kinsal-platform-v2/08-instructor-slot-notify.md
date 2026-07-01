# Phase 8: Instructor slot-update emails

## Status: ✅ Complete

## Overview

Email the instructor at **30 minutes before** each slot and at the **slot midpoint**, only when the roster (bookings + waitlists) changed since the last notification for that window. Uses Resend; no SMS to instructor.

## Prerequisites

- Phase 4b: Resend integration
- Phase 6: email infrastructure
- `CRON_SECRET` and pg_cron/pg_net enabled

## Planned Changes

- [x] Migration `instructor-slot-notify.sql` — `studio_settings.instructor_email`, `instructor_slot_notify_enabled`, `instructor_slot_notify_log`
- [x] `_shared/instructor-notify.ts` — window detection, roster hash, email HTML
- [x] `send-instructor-updates` edge function (CRON_SECRET, `--no-verify-jwt`)
- [x] `admin-action`: `getInstructorNotifySettings`, `saveInstructorNotifySettings`
- [x] Settings UI: instructor email + enable toggle
- [x] pg_cron every 5 minutes in `setup-ready.sql`

## Verification Checklist

- [ ] Set instructor email in Settings → save succeeds
- [ ] Booking ~35 min before slot → email at T-30 with roster
- [ ] No duplicate email if roster unchanged (cron runs again)
- [ ] Cancel before midpoint → midpoint email with updated roster
- [ ] Toggle off → no emails
- [ ] Empty slot at T-30 → no email

## Implementation Notes

- Occurrence key: `YYYY-MM-DD|Tuesday|am` (studio timezone calendar date + weekday + slot id).
- `pre_start` window: slot start minus 30 min (±5 min). Skips if zero bookings and zero waitlists.
- `midpoint` window: halfway between start and end (±5 min). Compares hash to most recent send for that occurrence.
- Register cron: run the Phase 8 block at bottom of `setup-ready.sql` in Supabase SQL Editor if not already scheduled.

## Deploy

```bash
supabase db query --linked --file supabase/migrations/instructor-slot-notify.sql
supabase functions deploy send-instructor-updates --no-verify-jwt --use-api
supabase functions deploy admin-action --use-api
```

## Navigation

← [07-polish-security.md](./07-polish-security.md) · ↑ [00-index.md](./00-index.md)
