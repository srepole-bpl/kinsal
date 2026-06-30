# Implementation Plan: Kinsal Platform v2

## Status: Planning

## Overview

Extend Kinsal from v1 (hardcoded wheels) to v2 (editable rooms, categorized resources with multi-seat tables, then schedule, auth, communications, and ops). Keep the hybrid stack: single `index.html` on GitHub Pages, Supabase Postgres + RLS, Deno edge functions. Phase 1 is split into four executable steps (DB → API → student grid → instructor Settings).

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
**Decision:** Zod in edge functions (`_shared/resources.ts`); lightweight client validation in `index.html`.

## Technical Approach

### Database Layer
- Phase 1: `rooms`, `resources`, `reservations.spot_index`, migrate from `wheels`
- Phase 2: `studio_days`, `schedule_slots`, `studio_settings`
- Phase 3: `students.auth_user_id`
- Phase 5: `slot_blocks`, `closed_days`, `audit_log`, student block flags
- Phase 6: `email_templates`, optional SMS fields on `students`

### API Layer
- Extend `admin-action`: `saveRooms`, `saveResources`, schedule, blocks, etc.
- Extend `manage-booking`: capacity-aware book/cancel; Phase 3 JWT
- New: `send-reminders` edge function (Phase 4)

### UI Layer
- `index.html` only: room-grouped grid, Settings panels, student dashboard additions

## Phase Breakdown

| Phase | Name | Complexity |
|-------|------|------------|
| 1a | DB: rooms, resources, spot_index | Medium |
| 1b | API: resources module + booking capacity | High |
| 1c | UI: student grid by room/category | Medium |
| 1d | UI: instructor Settings (rooms + resources) | Medium |
| 2 | Editable schedule | Medium |
| 3 | Magic link student auth | High |
| 4a | Student UX (bookings, waitlist, ICS) | Medium |
| 4b | Emails + reminder cron | Medium |
| 5a | Blocks + closed days | Medium |
| 5b | Roster CSV + booking limits + no-show block | Medium |
| 5c | Audit log + in-app PIN change | Medium |
| 6 | Email templates + broadcast + optional SMS | Medium |
| 7 | CORS, iframe resize, mobile polish | Low |

## Risks and Mitigations

- **Migration breaks live bookings:** Run SQL during low traffic; preserve resource ids; verify before dropping `wheels`.
- **Capacity race on tables:** Rely on `(key, spot_index)` unique constraint + count check in transaction.
- **Phase 3 auth breaks email lookup:** Link Auth user to roster row on first magic-link login.

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
        ├── manage-booking/
        └── admin-action/
```

## References

- [prd.md](./prd.md)
- [tech-stack.md](./tech-stack.md)
