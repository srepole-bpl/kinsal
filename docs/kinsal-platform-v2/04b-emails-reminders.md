# Phase 4b: Emails + reminder cron

## Status: Pending

## Overview

Send booking confirmation emails on successful reserve (Resend), and add a `send-reminders` edge function invoked by pg_cron for upcoming sessions. Reuse existing `_shared/email.ts` patterns from waitlist promotion.

## Prerequisites

- Phase 4a complete (book flow stable)
- `RESEND_API_KEY` secret set on Supabase project
- Phase 2 schedule in DB (for slot times in email body)

## Planned Changes

- [ ] Extend `_shared/email.ts`: `sendBookingConfirmation(student, booking, resource, slot)`
- [ ] Call confirmation send from `manage-booking` after successful book (non-blocking or await with timeout)
- [ ] Add `supabase/functions/send-reminders/index.ts`
- [ ] Query tomorrow's (or configurable) reservations; send reminder per student
- [ ] Add pg_cron job in migration (mirror `release-noshows` pattern with `CRON_SECRET`)
- [ ] Deploy function; register cron in `setup-ready.sql` or new migration
- [ ] Idempotency: track `reminder_sent_at` on reservations or separate `email_log` table

## Target Implementation Shape

**Confirmation email content**

```
Subject: Booked: Shimpo — Tuesday morning
Body: day, slot time, resource label, category, studio name, cancel link (optional)
```

**send-reminders**

```typescript
// POST with x-cron-secret header
// For each reservation where session starts in [now+24h, now+25h] and reminder not sent:
//   sendReminderEmail(student, booking)
//   mark reminder_sent_at
```

**Cron (example)**

```sql
select cron.schedule('send-reminders', '0 14 * * *', $$
  select net.http_post(... send-reminders ...);
$$);
```

## Files Touched

- `supabase/functions/_shared/email.ts`
- `supabase/functions/manage-booking/index.ts`
- `supabase/functions/send-reminders/index.ts` (new)
- `supabase/migrations/reminders.sql` (new — `reminder_sent_at` or `email_log`)
- `setup-ready.sql` (cron entry, if not in migration)

## Verification Checklist

- [ ] Book test slot → confirmation email received within 1 minute
- [ ] Reminder cron fires for booking starting tomorrow (manual invoke with secret)
- [ ] Duplicate reminder not sent on second cron run (idempotency)
- [ ] Missing Resend key fails gracefully with logged error, booking still succeeds
- [ ] Email includes human-readable category label

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [04a-student-ux.md](./04a-student-ux.md) · ↑ [04-phase4-overview.md](./04-phase4-overview.md) · → [05-phase5-overview.md](./05-phase5-overview.md)
