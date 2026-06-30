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

- Phase 3 complete (auth)
- Phase 4 recommended (emails for no-show notifications optional)

## End-to-end verification (after 5c)

- Blocked resource cannot be booked (403)
- Closed day disables grid
- CSV import adds students; export downloads reservations
- Audit log shows instructor actions after browser refresh
- PIN change works without Supabase dashboard

## Navigation

← [04b-emails-reminders.md](./04b-emails-reminders.md) · ↑ [00-index.md](./00-index.md) · → [05a-blocks-closed-days.md](./05a-blocks-closed-days.md)
