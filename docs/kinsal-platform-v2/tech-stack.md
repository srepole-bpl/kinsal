# Kinsal Platform v2 — Tech Stack

Hybrid architecture: keep the Pixiset iframe embed and single-page frontend; strengthen the backend with typed, validated edge functions and versioned SQL migrations.

---

## Stack summary

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | Vanilla HTML/CSS/JS in `index.html` | No build step; GitHub Pages deploy |
| Hosting (app) | GitHub Pages → iframe on Pixiset | URL: `https://srepole-bpl.github.io/kinsal/` |
| Database | Supabase PostgreSQL | RLS on all tables |
| Realtime | Supabase Realtime | Grid refresh on reservation changes |
| API / writes | Supabase Edge Functions (Deno, TypeScript) | All mutations; service role inside functions |
| Instructor auth | PIN hash + signed JWT (`verify-pin`, `JWT_SECRET`) | 20-minute session tokens |
| Student auth (Phase 3) | Supabase Auth magic link / OTP | Replaces email-only lookup |
| Email | Resend API | Waitlist, confirmations, reminders, broadcast |
| SMS (Phase 6, optional) | Twilio | Separate secret; opt-in per student |
| Cron | `pg_cron` + `pg_net` | No-show release, weekly reset, reminder jobs |
| Migrations | `supabase/migrations/*.sql` | Applied via Supabase SQL Editor or CLI |
| Types & validation | TypeScript + Zod in `supabase/functions/_shared/` | Shared across edge functions |

**Explicitly deferred:** Next.js, React, Shadcn/ui, TanStack Query — not required for Pixiset embed; revisit only if embed constraints change.

---

## Repository layout

```
kinsal/
├── index.html                          # Student + instructor UI (vanilla JS)
├── DEPLOY.md                           # Supabase deploy guide
├── setup.sql / setup-ready.sql         # Security + cron baseline
├── docs/
│   └── kinsal-platform-v2/
│       ├── tech-stack.md               # This file
│       └── prd.md                      # Mega product requirements
└── supabase/
    ├── config.toml
    ├── migrations/                     # Versioned schema changes
    │   ├── wheels.sql                  # v1 wheels (legacy)
    │   └── resources-rooms.sql         # v2 (Phase 1, when built)
    └── functions/
        ├── _shared/
        │   ├── cors.ts
        │   ├── db.ts                   # serviceClient()
        │   ├── jwt.ts
        │   ├── email.ts
        │   ├── waitlist.ts
        │   ├── wheels.ts               # v1; → resources.ts in v2
        │   ├── resources.ts            # Phase 1
        │   ├── schedule.ts             # Phase 2
        │   └── types/                  # Shared TS interfaces
        │       └── domain.ts
        ├── verify-pin/
        ├── manage-booking/             # Student writes + capacity logic
        ├── admin-action/               # Instructor writes
        └── release-noshows/            # Cron; --no-verify-jwt
```

---

## Frontend (`index.html`)

### Principles

- **Read-only Supabase client** for grid data (anon/publishable key).
- **All writes** go through `fetch()` to edge functions (`edgeCall`, `adminCall`).
- **No secrets** in the browser except the public publishable key.
- **State:** in-memory JS variables; Realtime subscriptions for live grid updates.

### Key client patterns

```javascript
const SUPABASE_URL = 'https://dhottawheezvotadbsqq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_...';  // publishable key, not legacy JWT

async function edgeCall(fn, payload) {
  return fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify(payload),
  });
}
```

### Pixiset embed

```html
<iframe
  src="https://srepole-bpl.github.io/kinsal/"
  width="100%"
  height="900"
  style="border:none; max-width:660px;"
  title="Kinsal booking"
></iframe>
```

Phase 7 adds optional `postMessage` height auto-resize from iframe to parent.

---

## Backend (Supabase Edge Functions)

### Function responsibilities

| Function | Caller | JWT verify | Purpose |
|----------|--------|------------|---------|
| `verify-pin` | Browser | Default on | Instructor login |
| `manage-booking` | Browser | Default on | Student lookup, book, cancel, waitlist |
| `admin-action` | Browser | Default on | Roster, resources, schedule, blocks, PIN |
| `release-noshows` | pg_cron | **Off** | No-show release; `CRON_SECRET` header |

### Shared module conventions

- **`serviceClient()`** — bypasses RLS for authorized server writes.
- **Zod schemas** — validate request bodies at function entry.
- **TypeScript interfaces** in `_shared/types/domain.ts` — rooms, resources, reservations.

Example validation pattern:

```typescript
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const bookSchema = z.object({
  action: z.literal("book"),
  studentId: z.string().min(1),
  day: z.string(),
  slotId: z.enum(["am", "pm"]),
  resourceId: z.string().min(1),
});
```

### Secrets (Edge Functions → Manage secrets)

| Secret | Required | Phase |
|--------|----------|-------|
| `PIN_HASH` | Yes | Now |
| `JWT_SECRET` | Yes | Now |
| `RESEND_API_KEY` | Yes | Now |
| `CRON_SECRET` | Yes | Now |
| `TWILIO_*` | No | Phase 6 |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

---

## Database

### Security model

- **anon:** SELECT on public grid data (`reservations`, `waitlists`, `no_shows`, `rooms`, `resources`, `schedule`, `blocks`).
- **anon:** SELECT on `student_directory` view (id + name only).
- **anon:** NO direct access to `students` emails, `settings`, `auth_throttle`, `audit_log`.
- **Writes:** only via edge functions using service role.

### Reservation key format

```
{day}|{slotId}|{resourceId}
```

Example: `Tuesday|am|table-a`

Multiple rows may share the same `key` when `resource.capacity > 1`. Category is **not** embedded in the key — only the stable `resourceId`.

### Resource categories

| Category | Seats | Use |
|----------|-------|-----|
| `wheel` | 1 | Pottery wheels |
| `hand_build_table` | 2–5 | Hand-building tables |
| `clay_prep_table` | 2–5 | Clay preparation |
| `glaze_table` | 2–5 | Glazing work |

Instructor edits category and seat count from Settings; see [prd.md](./prd.md) Phase 1.

### Cron jobs (existing)

| Job | Schedule | Action |
|-----|----------|--------|
| `kinsal-weekly-reset` | Mon 04:00 UTC | Clear reservations + waitlists |
| `kinsal-release-noshows` | Every 10 min | Call `release-noshows` edge function |
| `kinsal-send-reminders` | Phase 4 | TBD (e.g. hourly check) |

---

## Deploy workflow

1. Apply SQL migration in Supabase SQL Editor (or `supabase db query --linked --file ...`).
2. Set/update edge function secrets if needed.
3. Deploy functions:
   ```bash
   supabase functions deploy manage-booking --use-api
   supabase functions deploy admin-action --use-api
   supabase functions deploy verify-pin --use-api
   supabase functions deploy release-noshows --no-verify-jwt --use-api
   ```
4. Push `index.html` to GitHub; wait for Pages rebuild.
5. Hard-refresh Pixiset embed.

See [DEPLOY.md](../../DEPLOY.md) for first-time setup.

---

## Type generation (optional enhancement)

When schema stabilizes, generate types for edge functions:

```bash
supabase gen types typescript --project-id dhottawheezvotadbsqq \
  > supabase/functions/_shared/types/database.types.ts
```

Not required for v2 Phase 1; hand-written `domain.ts` is sufficient initially.

---

## Environment matrix

| Environment | Frontend | Database | Functions |
|-------------|----------|----------|-----------|
| Production | GitHub Pages | Supabase project `dhottawheezvotadbsqq` | Same project |
| Local dev | Open `index.html` or `npx serve` | Linked Supabase (no local Docker required) | `supabase functions deploy` |

---

## Phase-to-stack mapping

| Phase | New tables | New/changed functions | Frontend |
|-------|------------|----------------------|----------|
| 1 | `rooms`, `resources` (with `category`), `spot_index` on reservations | `saveRooms`, `saveResources`; capacity in `manage-booking` | Room-grouped grid, category badges, Settings |
| 2 | `schedule`, `studio_settings` | `saveSchedule`; dynamic window in `manage-booking` | Schedule Settings |
| 3 | Supabase Auth linkage on `students` | JWT verify in `manage-booking` | Magic link login |
| 4 | `email_log` (optional) | `send-reminders` cron | My bookings, .ics |
| 5 | `blocks`, `closed_days`, `audit_log` | admin actions | Ops UI |
| 6 | `email_templates`, `student_sms_opt_in` | Twilio helper | Template editor |
| 7 | — | CORS tighten in `_shared/cors.ts` | iframe resize, UX polish |

---

## References

- [prd.md](./prd.md) — full product requirements
- [DEPLOY.md](../../DEPLOY.md) — production deploy guide
- Repo: https://github.com/srepole-bpl/kinsal
