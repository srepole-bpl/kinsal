# Phase 1b: API — resources module + capacity booking

## Status: 🟡 In Progress

## Overview

Add shared resource types/validation, replace `wheels.ts` usage with `resources.ts`, implement `saveRooms`/`saveResources` in `admin-action`, and update `manage-booking` + email/waitlist for multi-seat keys and category labels.

## Prerequisites

- Phase 1a complete: `rooms`, `resources` tables live; reservations have `spot_index`

## Planned Changes

- [x] Add `supabase/functions/_shared/types/domain.ts`
- [x] Add `supabase/functions/_shared/resources.ts`
- [x] Update `admin-action`: `getRooms`, `saveRooms`, `getResources`, `saveResources`
- [x] Update `manage-booking`: capacity + `spot_index`
- [x] Update `_shared/email.ts` and `waitlist.ts`
- [x] Update `release-noshows` to delete by student_id
- [ ] Deploy functions *(blocked: CLI 401)*

## Target Implementation Shape

**admin-action actions**

```typescript
// saveRooms: JSON Room[] — max 10, unique labels, cannot delete room with resources
// saveResources: JSON Resource[] — max 20, category/capacity rules, cannot delete if bookings exist
// cannot reduce capacity below max concurrent bookings for that resource id
```

**manage-booking book flow**

```typescript
const resource = await getResource(db, resourceId);
const k = `${day}|${slotId}|${resourceId}`;
const { count } = await db.from("reservations").select("key", { count: "exact" }).eq("key", k);
if (count >= resource.capacity) return json({ error: "that slot is full" }, 409);
const spot_index = await nextFreeSpot(db, k, resource.capacity);
await db.from("reservations").insert({ key: k, student_id, spot_index });
```

**Parameter rename:** request body field stays `wheel` for backward compat OR rename to `resourceId` with alias — document choice in Implementation Notes.

## Files Touched

- `supabase/functions/_shared/types/domain.ts` (new)
- `supabase/functions/_shared/resources.ts` (new)
- `supabase/functions/_shared/wheels.ts` (delete or re-export from resources.ts during transition)
- `supabase/functions/admin-action/index.ts`
- `supabase/functions/manage-booking/index.ts`
- `supabase/functions/_shared/email.ts`
- `supabase/functions/_shared/waitlist.ts` (pass db to email if not already)

## Verification Checklist

- [ ] `curl` book 5th student on 5-seat table → 409 on 6th
- [ ] Wheel book still allows only one row per key
- [ ] `saveResources` rejects capacity 3 when 4 active bookings exist
- [ ] `saveResources` rejects invalid category/capacity combo (wheel with 5 seats)
- [ ] Waitlist promotion email shows human category label (e.g. "clay prep")
- [ ] Functions deploy without error (`supabase functions deploy ... --use-api`)

## Implementation Notes

- Request body accepts `resourceId` with backward-compat alias `wheel`
- `saveWheels` kept in admin-action for legacy; frontend uses `saveResources`
- `adminCancel` / `noShow` accept optional `studentId` for multi-seat tables
- Deploy pending Supabase CLI re-auth

## Navigation

← [01a-db-resources-rooms.md](./01a-db-resources-rooms.md) · ↑ [01-phase1-overview.md](./01-phase1-overview.md) · → [01c-ui-student-grid.md](./01c-ui-student-grid.md)
