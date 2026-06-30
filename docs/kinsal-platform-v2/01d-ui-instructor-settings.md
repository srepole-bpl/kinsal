# Phase 1d: UI — instructor Settings (rooms + resources)

## Status: 🟡 In Progress

## Overview

Replace v1 "Wheels" Settings section with full **Rooms** and **Resources** editors: custom room names, category dropdown (wheel / hand building / clay prep / glaze), editable seats (2–5), room assignment, save via `saveRooms` / `saveResources`.

## Prerequisites

- Phase 1b complete: `saveRooms`, `saveResources` deployed
- Phase 1c optional but recommended (validates read path)

## Planned Changes

- [x] Rooms + Resources Settings panels in `index.html`
- [ ] Push to GitHub Pages

## Target Implementation Shape

```javascript
const CATEGORY_OPTIONS = [
  { value: 'wheel', label: 'Wheel' },
  { value: 'hand_build_table', label: 'Hand-building table' },
  { value: 'clay_prep_table', label: 'Clay prep table' },
  { value: 'glaze_table', label: 'Glaze table' },
];

async function saveResources() {
  const payload = draftResources.map(r => ({
    id: r.id || '',
    room_id: r.room_id,
    label: sanitizeResourceName(r.label),
    category: r.category,
    capacity: r.category === 'wheel' ? 1 : parseInt(r.capacity, 10),
  }));
  const data = await adminCall('saveResources', { resources: JSON.stringify(payload) });
  // reload rooms/resources; renderDash(); renderSlots();
}
```

## Files Touched

- `index.html`

## Verification Checklist

- [ ] Add room "Glaze room" → appears on grid after save
- [ ] Rename room label → grid header updates
- [ ] Add clay prep table with 3 seats → grid shows "clay prep · X of 3 seats"
- [ ] Change category hand_build → glaze → badge updates; bookings unchanged
- [ ] Reduce seats below booking count → toast with server error
- [ ] Remove resource with active booking → blocked with message
- [ ] Cannot remove room that still has resources

## Implementation Notes

- Category dropdown with seat count 2–5; wheels locked at 1
- Category change wheel→table defaults capacity to 4
- Requires Phase 1b deployed + migration for save to work against `rooms`/`resources` tables

## Navigation

← [01c-ui-student-grid.md](./01c-ui-student-grid.md) · ↑ [01-phase1-overview.md](./01-phase1-overview.md) · → [02-schedule.md](./02-schedule.md)
