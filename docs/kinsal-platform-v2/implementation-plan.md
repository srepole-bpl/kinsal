# Implementation Plan: Kinsal Platform v2

## Status: In Progress (Phases 1–4 complete; Phase 5 next)

## Overview

Extend Kinsal from v1 (hardcoded wheels) to v2 (editable rooms, categorized resources with multi-seat tables, schedule, student UX, instructor ops). Keep the hybrid stack: single `index.html` on GitHub Pages, Supabase Postgres + RLS, Deno edge functions. Phase 1 was split into four executable steps (DB → API → student grid → instructor Settings).

**Completed:** 1a–1d, 2, 4a–4b (`9866e1f`). **Cancelled:** Phase 3 magic-link auth (simple email lookup retained). **Next:** Phase 5 instructor ops (5a → 5b → 5c).

## Architecture Decisions

### Decision 1: Resource model replaces wheels
**Options:** (A) Extend `wheels` table with capacity column; (B) New `rooms` + `resources` with `category`.

**Decision:** B — `resources` with `category` (`wheel`, `hand_build_table`, `clay_prep_table`, `glaze_table`) and stable `id` in reservation keys.

**Rationale:** Supports table sub-types and room grouping without breaking existing keys after migration.

### Decision 2: Multi-seat booking
**Options:** (A) Student picks spot; (B) Table-level book, server assigns `spot_index`.

**Decision:** B.

**Rationale:** PRD confirmed; simpler UX.

### Decision 3: Frontend architecture
**Options:** (A) Next.js rewrite; (B) Continue vanilla `index.html`.

**Decision:** B (hybrid).

**Rationale:** Pixiset iframe embed; incremental delivery.

### Decision 4: Validation location
**Decision:** Zod-style validation in edge functions (`_shared/resources.ts`, etc.); lightweight client validation in `index.html`.

### Decision 5: Student authentication (Phase 3 — revised)
**Options:** (A) Supabase Auth magic links; (B) Email roster lookup only.

**Decision:** B — reverted after production trial (slow UX, email delivery issues).

**Rationale:** Studio roster is trusted; `manage-booking` validates `studentId` against roster on writes.

### Decision 6: Closed days vs recurring weekday keys
**Options:** (A) Add calendar date to reservation keys; (B) Keep `Tuesday|am|resource` keys, resolve calendar date at book time.

**Decision:** B.

**Rationale:** Matches existing schedule model. At book time, compute the **next occurrence** of that weekday in `studio_settings.timezone` and reject if that calendar date is in `closed_days`.

### Decision 7: Slot block matching
**Decision:** `slot_blocks.key_pattern` uses prefix match on full reservation key (`Tuesday|am|shimpo`). Patterns may omit trailing segments (e.g. `Tuesday|am|` blocks all resources that slot).

### Decision 8: Instructor PIN storage (Phase 5c)
**Options:** (A) Supabase Management API `secrets set` from edge function; (B) `instructor_secrets` table (service-role only).

**Decision:** B — `instructor_secrets` row with SHA-256 hash; `verify-pin` reads DB first, falls back to `PIN_HASH` env for migration.

**Rationale:** Avoids Management API token scope; PIN change is a single DB update + audit entry.

## Technical Approach

### Database Layer
- Phase 1: `rooms`, `resources`, `reservations.spot_index`, migrate from `wheels` ✅
- Phase 2: `studio_days`, `schedule_slots`, `studio_settings` ✅
- Phase 3: `students.auth_user_id` — column may exist; unused (auth cancelled)
- Phase 4: `reservations.reminder_sent_at` ✅
- Phase 5a: `slot_blocks`, `closed_days`
- Phase 5b: `students.booking_blocked_until`, `students.no_show_count`; extend `studio_settings` with caps
- Phase 5c: `audit_log`, `instructor_secrets`
- Phase 6: `email_templates`, optional SMS fields on `students`

### API Layer
- Extend `admin-action`: blocks, closed days, CSV import/export, audit, changePin ✅ partial (rooms/resources/schedule exist)
- Extend `manage-booking`: blocks, weekly cap, booking block flags
- `send-reminders` ✅
- Instrument `release-noshows` for no-show count (5b)

### UI Layer
- `index.html` only: room-grouped grid, Settings panels, student dashboard additions

## Phase Breakdown

| Phase | Name | Complexity | Status |
|-------|------|------------|--------|
| 1a | DB: rooms, resources, spot_index | Medium | ✅ |
| 1b | API: resources module + booking capacity | High | ✅ |
| 1c | UI: student grid | Medium | ✅ |
| 1d | UI: instructor Settings (rooms + resources) | Medium | ✅ |
| 2 | Editable schedule | Medium | ✅ |
| 3 | Magic link student auth | High | Cancelled |
| 4a | Student UX (bookings, waitlist, ICS) | Medium | ✅ |
| 4b | Emails + reminder cron | Medium | ✅ |
| 5a | Blocks + closed days | Medium | Pending |
| 5b | Roster CSV + booking limits + no-show block | Medium | Pending |
| 5c | Audit log + in-app PIN change | Medium | Pending |
| 6 | Email templates + broadcast + optional SMS | Medium | Pending |
| 7 | CORS, iframe resize, mobile polish | Low | Pending |

## Risks and Mitigations

- **Migration breaks live bookings:** Run SQL during low traffic; preserve resource ids; verify before dropping `wheels`.
- **Capacity race on tables:** Rely on `(key, spot_index)` unique constraint + count check in transaction.
- **Phase 3 auth breaks email lookup:** Resolved — kept email lookup; no Auth dependency.
- **Closed day on recurring weekday:** Compute next calendar date for booked weekday in studio TZ before `isClosed` check.
- **PIN change without dashboard:** `instructor_secrets` table; no Management API required.

## File Structure Preview

```
kinsal/
├── index.html
├── docs/kinsal-platform-v2/
│   ├── prd.md
│   ├── tech-stack.md
│   ├── implementation-plan.md
│   └── 00-index.md … phase step files
└── supabase/
    ├── migrations/
    └── functions/
        ├── _shared/types/domain.ts
        ├── _shared/resources.ts
        ├── _shared/blocks.ts          # Phase 5a
        ├── _shared/audit.ts           # Phase 5c
        ├── manage-booking/
        ├── admin-action/
        └── send-reminders/
```

## Phase 5 execution order

Implement **5a → 5b → 5c** (each deployable independently):

| Step | Deliverable | Deploy |
|------|-------------|--------|
| 5a | `blocks-closed.sql`, `_shared/blocks.ts`, admin CRUD, grid grey-out | migration + `admin-action` + `manage-booking` |
| 5b | `roster-limits.sql`, CSV import/export, weekly cap, no-show block | migration + `admin-action` + `manage-booking` + `release-noshows` |
| 5c | `audit-log.sql`, `_shared/audit.ts`, audit viewer, change PIN | migration + `admin-action` + `verify-pin` |

## Next Steps

1. Implement [05a-blocks-closed-days.md](./05a-blocks-closed-days.md) (`implement-step` workflow)
2. Then 5b, then 5c
3. Phase 6 communications after 5c

## References

- [prd.md](./prd.md)
- [tech-stack.md](./tech-stack.md)
- [00-index.md](./00-index.md)
