# Phase 1: Rooms, resources, categories (overview)

## Status: 🟡 In Progress

## Overview

Foundation for Kinsal v2: replace `wheels` with `rooms` + `resources` (four categories, editable seats 2–5 on tables), capacity-aware booking, room-grouped student grid, and instructor Settings. Delivered in four sub-phases so DB, API, and UI can ship and verify independently.

## Sub-phases

| Step | File | Milestone |
|------|------|-----------|
| 1a | [01a-db-resources-rooms.md](./01a-db-resources-rooms.md) | `rooms` + `resources` exist; wheels migrated; RLS on |
| 1b | [01b-api-resources-booking.md](./01b-api-resources-booking.md) | `saveRooms`/`saveResources`; capacity book/cancel live |
| 1c | [01c-ui-student-grid.md](./01c-ui-student-grid.md) | Students see room headers, categories, seat counts |
| 1d | [01d-ui-instructor-settings.md](./01d-ui-instructor-settings.md) | Instructor edits rooms, categories, seats |

## Prerequisites

- v1 deployed: edge functions, `wheels` table, `index.html` on GitHub Pages
- PRD decisions locked ([prd.md](./prd.md))

## End-to-end verification (after 1d)

Run smoke tests from PRD Phase 1 acceptance criteria: migrate wheels, add clay prep table, category change, seat reduction guard, multi-seat book, waitlist.

## Navigation

→ Start: [01a-db-resources-rooms.md](./01a-db-resources-rooms.md)
