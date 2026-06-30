# Feature: Kinsal Platform v2

## Status: In Progress

## Quick Links

- [PRD](./prd.md)
- [Tech Stack](./tech-stack.md)
- [Implementation Plan](./implementation-plan.md)

## Phases

| Phase | File | Status | Commit |
|-------|------|--------|--------|
| **1 — Resources foundation** | [01-phase1-overview.md](./01-phase1-overview.md) | Complete | `2c6b7f6`, `71da723` |
| 1a. Database | [01a-db-resources-rooms.md](./01a-db-resources-rooms.md) | Complete | `2c6b7f6` |
| 1b. API | [01b-api-resources-booking.md](./01b-api-resources-booking.md) | Complete | `2c6b7f6` |
| 1c. Student grid UI | [01c-ui-student-grid.md](./01c-ui-student-grid.md) | Complete | `71da723` |
| 1d. Instructor Settings UI | [01d-ui-instructor-settings.md](./01d-ui-instructor-settings.md) | Complete | `2c6b7f6` |
| 2. Editable schedule | [02-schedule.md](./02-schedule.md) | Complete | `4739450` |
| 3. Student auth | [03-student-auth.md](./03-student-auth.md) | Cancelled | reverted |
| **4 — Student experience** | [04-phase4-overview.md](./04-phase4-overview.md) | ✅ Complete | `9866e1f` |
| 4a. Student UX | [04a-student-ux.md](./04a-student-ux.md) | ✅ Complete | `9866e1f` |
| 4b. Emails + reminders | [04b-emails-reminders.md](./04b-emails-reminders.md) | ✅ Complete | `9866e1f` |
| **5 — Instructor ops** | [05-phase5-overview.md](./05-phase5-overview.md) | Pending | — |
| 5a. Blocks + closed days | [05a-blocks-closed-days.md](./05a-blocks-closed-days.md) | ✅ Complete | `fd1b6fc` |
| 5b. Roster CSV + limits | [05b-roster-limits.md](./05b-roster-limits.md) | ✅ Complete | `e80ae5d` |
| 5c. Audit + PIN | [05c-audit-pin.md](./05c-audit-pin.md) | Pending | — |
| 6. Communications | [06-communications.md](./06-communications.md) | Pending | — |
| 7. Polish + security | [07-polish-security.md](./07-polish-security.md) | Pending | — |

## Status Legend

- Pending
- In Progress
- Complete
- Blocked

## Current Context

- Phase 5b **complete and deployed**. Next: **Phase 5c** — audit log + in-app PIN ([05c-audit-pin.md](./05c-audit-pin.md)).

## Architectural Decisions Made

- **Resources replace wheels:** stable `id` in keys; `category` for wheel / hand_build / clay_prep / glaze
- **Table-level booking:** server assigns `spot_index`; classic student UI shows one row per resource
- **Rooms:** editable labels; instructor dashboard grouped by room; student grid flat list
- **Hybrid stack:** keep `index.html` + edge functions (no Next.js)

## Blockers / Open Questions

- [ ] Pixiset exact origin URL for Phase 7 CORS (add when known)
- [x] ~~Supabase Management API for in-app PIN change~~ — use `instructor_secrets` table instead (see implementation-plan Decision 8)

## Phase 1 split rationale

Phase 1 exceeded size signals (>8 files, DB + API + two UI surfaces). Split into 1a→1b→1c→1d so each step is deployable and verifiable independently.
