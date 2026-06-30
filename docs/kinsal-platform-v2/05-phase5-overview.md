# Phase 5: Instructor operations (overview)

## Status: Pending

## Overview

Operational tools for Salma: block slots/resources, mark closed days, roster CSV import/export, weekly booking limits, no-show blocking, server-side audit log, and in-app PIN change. Split into three sub-phases to keep each deploy verifiable.

## Sub-phases

| Step | File | Milestone |
|------|------|-----------|
| 5a | [05a-blocks-closed-days.md](./05a-blocks-closed-days.md) | Blocks + closed days enforced server-side |
| 5b | [05b-roster-limits.md](./05b-roster-limits.md) | CSV roster + weekly cap + no-show block |
| 5c | [05c-audit-pin.md](./05c-audit-pin.md) | Audit log + change PIN in Settings |

## Prerequisites

- Phase 2 complete: schedule from DB ✅
- Phase 4 complete: book flow + confirmation emails ✅
- Phase 3 **not required** (cancelled; student login is email lookup)

## Architecture (see [implementation-plan.md](./implementation-plan.md))

- **Closed days:** calendar dates in `closed_days`; at book time resolve next occurrence of weekday in studio TZ
- **Slot blocks:** prefix match on `day|slot|resource` key
- **PIN change:** `instructor_secrets` table (not Supabase Management API)
- **Weekly cap:** count reservations in rolling Mon–Sun week (studio timezone)
- **No-show block:** `release-noshows` increments count; instructor clears in roster UI

## End-to-end verification (after 5c)

- Blocked resource cannot be booked (403)
- Closed day disables booking for that calendar date
- CSV import adds students; export downloads reservations
- Audit log shows instructor actions after browser refresh
- PIN change works without Supabase dashboard

## Navigation

← [04b-emails-reminders.md](./04b-emails-reminders.md) · ↑ [00-index.md](./00-index.md) · → [05a-blocks-closed-days.md](./05a-blocks-closed-days.md)
