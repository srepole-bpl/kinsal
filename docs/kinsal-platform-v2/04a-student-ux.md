# Phase 4a: Student UX — bookings, waitlist, ICS

## Status: Pending

## Overview

Add student dashboard views for upcoming reservations and active waitlist entries, a `leave_waitlist` action, and client- or server-generated `.ics` calendar files per booking.

## Prerequisites

- Phase 3 complete: session-backed student id available in UI

## Planned Changes

- [ ] Add "My bookings" panel in student view: list upcoming keys with day, slot, resource label, category
- [ ] Add `leaveWaitlist` to `manage-booking` (remove waitlist row for authenticated student + key)
- [ ] Wire leave waitlist button in grid and my-bookings list
- [ ] Add `getMyBookings` query (client-side filter or new read endpoint if RLS requires)
- [ ] Implement ICS: client-generated from schedule + reservation data, or thin edge endpoint
- [ ] Include category label and room in booking display strings

## Target Implementation Shape

**manage-booking action**

```typescript
// leave_waitlist: { day, slotId, resourceId } + JWT
// deletes waitlists row where key matches and student_id = auth student
```

**ICS (client-side example)**

```javascript
function bookingToIcs({ day, slot, resource, studentEmail }) {
  // DTSTART/DTEND from schedule_slots + next occurrence of weekday
  // SUMMARY: `${resource.label} (${categoryLabel}) — Kinsal`
}
```

**My bookings query**

```javascript
// Filter reservations where student_id === currentStudent.id
// Join resource label via loaded resources map
// Sort by next calendar occurrence of day+slot
```

## Files Touched

- `supabase/functions/manage-booking/index.ts`
- `index.html`

## Verification Checklist

- [ ] My bookings shows only logged-in student's reservations
- [ ] Leave waitlist removes student from queue; position updates for others
- [ ] ICS download produces valid `.ics` file (import test in calendar app)
- [ ] Cancel from my bookings still works (Phase 3 auth)
- [ ] Empty state when no upcoming bookings

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [04-phase4-overview.md](./04-phase4-overview.md) · ↑ [00-index.md](./00-index.md) · → [04b-emails-reminders.md](./04b-emails-reminders.md)
