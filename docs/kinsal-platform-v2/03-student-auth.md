# Phase 3: Student authentication (magic link)

## Status: Pending

## Overview

Replace client-trusted `studentId` with Supabase Auth magic links. Link roster rows to Auth users on first login; `manage-booking` derives student identity from JWT for all write actions.

## Prerequisites

- Phase 2 complete (or Phase 1 minimum): booking flow stable
- Supabase Auth email provider configured (Resend SMTP or Supabase default)

## Planned Changes

- [ ] Add `students.auth_user_id uuid references auth.users(id)` migration
- [ ] Enable Supabase Auth in project; configure redirect URL to GitHub Pages embed
- [ ] Add `_shared/auth.ts` (verify JWT, resolve student from `auth_user_id` or email claim)
- [ ] Update `manage-booking`: require Authorization header for book/cancel/waitlist; ignore body `studentId`
- [ ] Update `index.html`: login panel (email → magic link); session persistence; logout
- [ ] Link-on-first-login: match JWT email to `students.email`; set `auth_user_id`
- [ ] Handle roster email not yet in Auth (invite / "contact instructor" message)
- [ ] Update RLS if any student-facing reads need auth (optional: keep anon read for grid)

## Target Implementation Shape

**manage-booking auth gate**

```typescript
const user = await getUserFromRequest(req);
if (!user) return json({ error: "sign in required" }, 401);
const student = await resolveStudent(db, user);
if (!student) return json({ error: "email not on roster" }, 403);
// use student.id for all writes
```

**Frontend**

```javascript
const { data: { session } } = await supabase.auth.getSession();
// edgeCall includes Authorization: Bearer ${session.access_token}
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: KINSAL_URL } });
```

**Cancel authorization:** only delete reservation where `student_id === resolvedStudent.id`.

## Files Touched

- `supabase/migrations/student-auth.sql` (new)
- `supabase/functions/_shared/auth.ts` (new)
- `supabase/functions/manage-booking/index.ts`
- `index.html`
- Supabase dashboard: Auth URL config (document in Implementation Notes)

## Verification Checklist

- [ ] Unauthenticated book attempt returns 401
- [ ] Magic link login completes and session persists on refresh
- [ ] Student A cannot cancel Student B's reservation (403 or 404)
- [ ] Email on roster links to student row on first login
- [ ] Email not on roster shows clear error, no book access
- [ ] Instructor PIN flow unchanged (separate from student auth)

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [02-schedule.md](./02-schedule.md) · ↑ [00-index.md](./00-index.md) · → [04-phase4-overview.md](./04-phase4-overview.md)
