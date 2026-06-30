# Phase 5c: Audit log + in-app PIN change

## Status: Pending

## Overview

Persist instructor and system actions to `audit_log` (survives browser refresh), and allow PIN change from Settings without opening Supabase dashboard. Replaces or supplements client-only session log.

## Prerequisites

- Phase 1b+ admin-action patterns established
- `verify-pin` and `PIN_HASH` secret working in production

## Planned Changes

- [ ] Add `supabase/migrations/audit-log.sql` (`audit_log` table, RLS deny anon)
- [ ] Add `_shared/audit.ts` (`writeAudit(db, actor, action, detail)`)
- [ ] Instrument `admin-action` writes: saveRooms, saveResources, saveSchedule, blocks, roster, clearNoShow
- [ ] Instrument `manage-booking` instructor overrides if any; `release-noshows` as system actor
- [ ] Extend `admin-action`: `getAuditLog` (paginated), `changePin` (verify old PIN, set new hash)
- [ ] PIN storage: update `PIN_HASH` via Supabase Management API **or** `instructor_secrets` table with hashed PIN
- [ ] Instructor UI: Audit log viewer (last 50 entries); Change PIN form in Settings
- [ ] Update `verify-pin` if PIN moves from env-only to DB table

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

- [ ] Save resources → audit entry appears in log
- [ ] Instructor cancel / no-show reset → audit entry with student detail
- [ ] Audit log survives page refresh (loaded from DB)
- [ ] Change PIN with wrong current PIN → rejected
- [ ] Change PIN with correct current → new PIN works on next instructor login
- [ ] Anon cannot read or write `audit_log`

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [05b-roster-limits.md](./05b-roster-limits.md) · ↑ [05-phase5-overview.md](./05-phase5-overview.md) · → [06-communications.md](./06-communications.md)
