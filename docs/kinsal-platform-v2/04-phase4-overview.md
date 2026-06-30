# Phase 4: Student experience (overview)

## Status: Pending

## Overview

Improve the student-facing product after auth: upcoming bookings dashboard, leave waitlist, booking confirmation emails, reminder cron, and calendar (.ics) export. Split into UX (4a) and email/cron infrastructure (4b) so UI can ship before cron is scheduled.

## Sub-phases

| Step | File | Milestone |
|------|------|-----------|
| 4a | [04a-student-ux.md](./04a-student-ux.md) | My bookings, leave waitlist, ICS download |
| 4b | [04b-emails-reminders.md](./04b-emails-reminders.md) | Confirmation on book; day-before reminder cron |

## Prerequisites

- Phase 3 complete: authenticated student identity on all writes

## End-to-end verification (after 4b)

- Book slot → confirmation email within 1 minute
- Tomorrow's booking receives reminder per cron
- ICS opens in Google Calendar / Apple Calendar

## Navigation

← [03-student-auth.md](./03-student-auth.md) · ↑ [00-index.md](./00-index.md) · → [04a-student-ux.md](./04a-student-ux.md)
