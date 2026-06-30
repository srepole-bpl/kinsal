# Phase 1c: UI — student grid (rooms + categories + seats)

## Status: 🟡 In Progress

## Overview

Replace `loadWheels()` / flat `WHEELS` loop with `loadRooms()` + `loadResources()`, render booking grid grouped by room with category badges and "X of Y seats" for tables. Pass `resource.id` to book/cancel/waitlist calls.

## Prerequisites

- Phase 1b complete: API accepts `resourceId`; anon can read `rooms` and `resources`

## Planned Changes

- [x] All planned UI changes in `index.html`
- [ ] Push to GitHub Pages

## Target Implementation Shape

```javascript
let rooms = [], resources = [], resourcesByRoom = {};

function categoryLabel(c) {
  return { wheel:'wheel', hand_build_table:'hand building',
    clay_prep_table:'clay prep', glaze_table:'glaze' }[c] || c;
}

function bookedCount(key) {
  return Object.entries(reservations).filter(([k,v]) => k === key && v).length;
  // or count rows from loaded reservation list for multi-spot keys
}

// render: for each room → for each resource in room → slot row
// wheel: show name or "available"
// table: show `${booked} of ${resource.capacity} seats`
```

**Reservation map change:** v1 used one student per key; v2 may have multiple students per key — load from DB rows, group by key for counts.

## Files Touched

- `index.html`

## Verification Checklist

- [ ] Grid shows "Main studio" header and wheels under it
- [ ] Table row shows "2 of 4 seats" when 2 bookings share key
- [ ] Category appears next to label (e.g. "Table A · hand building")
- [ ] Reserve button calls API with resource id; booking sticks after refresh
- [ ] Instructor dashboard today tab matches student grid grouping
- [ ] Hard refresh on Pixiset iframe shows updated grid

## Implementation Notes

- Reservations loaded as arrays per key (multi-seat)
- Falls back to `wheels` table if `resources` not yet migrated
- Realtime subscriptions on `resources` and `rooms` tables

## Navigation

← [01b-api-resources-booking.md](./01b-api-resources-booking.md) · ↑ [01-phase1-overview.md](./01-phase1-overview.md) · → [01d-ui-instructor-settings.md](./01d-ui-instructor-settings.md)
