# Phase 4b: Emails + reminder cron

## Status: ✅ Complete

## Overview

Send booking confirmation emails on successful reserve (Resend), and add a `send-reminders` edge function invoked by pg_cron for upcoming sessions. Reuse existing `_shared/email.ts` patterns from waitlist promotion.

## Prerequisites

- Phase 4a complete (book flow stable)
- `RESEND_API_KEY` secret set on Supabase project
- Phase 2 schedule in DB (for slot times in email body)

## Planned Changes

- [x] Extend `_shared/email.ts`: `sendBookingConfirmation(student, booking, resource, slot)`
- [x] Call confirmation send from `manage-booking` after successful book (non-blocking or await with timeout)
- [x] Add `supabase/functions/send-reminders/index.ts`
- [x] Query tomorrow's (or configurable) reservations; send reminder per student
- [x] Add pg_cron job in migration (mirror `release-noshows` pattern with `CRON_SECRET`)
- [x] Deploy function; register cron in `setup-ready.sql` or new migration
- [x] Idempotency: track `reminder_sent_at` on reservations or separate `email_log` table

## Implementation Notes

**Migration:** `supabase/migrations/reminders.sql` adds `reservations.reminder_sent_at`.

**Confirmation:** Fired async after book; booking succeeds even if Resend is missing or fails.

**Reminders:** `send-reminders` selects reservations for **tomorrow's weekday** (studio timezone) where `reminder_sent_at` is null, sends email, marks sent.

**Cron:** Schedule added to `setup-ready.sql` (`kinsal-send-reminders`, daily 14:00 UTC). Run that block in SQL Editor if cron not yet registered:

```sql
select cron.schedule('kinsal-send-reminders', '0 14 * * *', $$ ... send-reminders ... $$);
```

**Deploy:**
```bash
supabase db query --linked --file supabase/migrations/reminders.sql
supabase functions deploy manage-booking --use-api
supabase functions deploy send-reminders --no-verify-jwt --use-api
```

**Manual test:** POST to `send-reminders` with `x-cron-secret` header matching `CRON_SECRET`.

## Navigation

← [04a-student-ux.md](./04a-student-ux.md) · ↑ [04-phase4-overview.md](./04-phase4-overview.md) · → [05-phase5-overview.md](./05-phase5-overview.md)
