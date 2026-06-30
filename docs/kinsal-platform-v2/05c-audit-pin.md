# Phase 5c: Audit log + in-app PIN change

## Status: ✅ Complete

## Overview

Persist instructor and system actions to `audit_log` (survives browser refresh), and allow PIN change from Settings without opening Supabase dashboard. Replaces or supplements client-only session log.

## Prerequisites

- Phase 1b+ admin-action patterns established
- `verify-pin` and `PIN_HASH` secret working in production

## Planned Changes

- [x] Add `supabase/migrations/audit-log.sql` (`audit_log` table, RLS deny anon)
- [x] Add `_shared/audit.ts` (`writeAudit(db, actor, action, detail)`)
- [x] Instrument `admin-action` writes: saveRooms, saveResources, saveSchedule, blocks, roster, clearNoShow
- [x] Instrument `release-noshows` as system actor
- [x] Extend `admin-action`: `getAuditLog` (paginated), `changePin` (verify old PIN, set new hash)
- [x] PIN storage: `instructor_secrets` table with hashed PIN; env `PIN_HASH` fallback
- [x] Instructor UI: Audit log viewer (last 50 entries); Change PIN form in Settings
- [x] Update `verify-pin` to read DB hash first, fallback to env

## Target Implementation Shape

**audit_log**

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (actor in ('instructor','system','student')),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
```

**changePin**

```typescript
// Body: { token, currentPin, newPin }
// Verify currentPin against PIN_HASH
// Hash newPin (same algo as verify-pin)
// supabase secrets set PIN_HASH=... OR update secrets table
// writeAudit('instructor', 'change_pin', {})
```

**Open question (resolved):** PIN stored in `instructor_secrets` table (service-role only). `verify-pin` reads DB hash; `changePin` in admin-action updates it. Env `PIN_HASH` remains fallback until first change.

## Files Touched

- `supabase/migrations/audit-log.sql` (new)
- `supabase/functions/_shared/audit.ts` (new)
- `supabase/functions/admin-action/index.ts`
- `supabase/functions/verify-pin/index.ts` (if PIN source changes)
- `supabase/functions/release-noshows/index.ts`
- `index.html`

## Verification Checklist

- [x] Save resources → audit entry appears in log
- [x] Instructor cancel / no-show → audit entry with detail
- [x] Audit log survives page refresh (loaded from DB)
- [x] Change PIN with wrong current PIN → rejected
- [x] Change PIN with correct current → new PIN works on next instructor login
- [x] Anon cannot read or write `audit_log`

## Implementation Notes

- Added `audit_log` and `instructor_secrets` tables; both revoked from anon/authenticated (service-role only).
- `_shared/audit.ts` and `_shared/pin.ts` shared by admin-action, verify-pin.
- `changePin` accepts `currentPinHash` / `newPinHash` (same SHA-256 client hashing as login).
- Security tab loads server audit via `getAuditLog`; session log kept as secondary browser-only view.
- After first in-app PIN change, hash lives in `instructor_secrets`; env `PIN_HASH` remains fallback until then.

## Navigation

← [05b-roster-limits.md](./05b-roster-limits.md) · ↑ [05-phase5-overview.md](./05-phase5-overview.md) · → [06-communications.md](./06-communications.md)
