# Phase 5a: Blocks + closed days

## Status: ✅ Complete

## Overview

Allow instructor to block specific resource/slot combinations and mark entire calendar dates as studio closed. Enforce both in `manage-booking` and reflect in student grid (greyed out / hidden).

## Prerequisites

- Phase 2 complete: schedule from DB ✅
- Phase 1 complete: resource ids in reservation keys ✅

## Planned Changes

- [x] Add `supabase/migrations/blocks-closed.sql` (`slot_blocks`, `closed_days`)
- [x] Add `_shared/blocks.ts` (isBlocked(key, date), isClosed(date))
- [x] Extend `admin-action`: `getBlocks`, `saveBlocks`, `getClosedDays`, `saveClosedDays`
- [x] Update `manage-booking`: reject book if block matches key prefix or closed day
- [x] Instructor UI: Blocks panel (pick day/slot/resource, reason); Closed days calendar/list
- [x] Student grid: show blocked rows greyed with reason tooltip; closed days message

## Implementation Notes

**Closed days:** At book time, resolve the **next calendar date** for the booked weekday in `studio_settings.timezone` and check `closed_days`.

**Blocks:** Prefix match on reservation key (`Tuesday|am|` blocks all resources that slot).

**RLS:** Anon can SELECT both tables; writes only via service role in edge functions.

**Settings UI:** Instructor → Settings → slot blocks / closed days panels.

**Deploy:**
```bash
supabase db query --linked --file supabase/migrations/blocks-closed.sql
supabase functions deploy manage-booking --use-api
supabase functions deploy admin-action --use-api
```

## Navigation

← [05-phase5-overview.md](./05-phase5-overview.md) · ↑ [00-index.md](./00-index.md) · → [05b-roster-limits.md](./05b-roster-limits.md)
