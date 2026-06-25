# Kinsal — deploy guide

This turns the prototype into a locked-down app. Do the steps **in order**. The
ordering matters: if you lock down RLS *before* the edge functions are live,
writes will break, because the browser no longer writes directly.

Estimated time: ~25 minutes.

---

## What you're deploying

- **4 edge functions** — every write now goes through these. The browser can no
  longer write to the database directly.
- **A locked-down database** — the public anon key can now only *read* the
  booking grid. It can't read student emails or write anything.
- **2 server jobs** — no-show release (every 10 min) and the Sunday-night reset.

---

## Step 1 — Set 4 secrets

In Supabase → **Edge Functions → Manage secrets**, add these four. They live on
the server and never reach the browser.

| Secret | Value |
|---|---|
| `PIN_HASH` | The SHA-256 hash of your **new** instructor PIN. **Do not keep 1234.** Generate the hash from the instructor dashboard → settings → "get hash", or any SHA-256 tool. |
| `JWT_SECRET` | A long random string (40+ chars). This signs instructor tokens — treat it like a password. |
| `RESEND_API_KEY` | Your existing Resend API key. |
| `CRON_SECRET` | Another long random string. The cron job uses it to prove it's allowed to release no-shows. |

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions
> automatically — you don't set those.

---

## Step 2 — Deploy the 4 edge functions

The `supabase/functions/` folder is laid out so the CLI can deploy directly:

```
supabase/functions/
  _shared/        ← shared code (cors, db, jwt, email, waitlist)
  verify-pin/
  manage-booking/
  admin-action/
  release-noshows/
```

From the project root:

```bash
supabase functions deploy verify-pin
supabase functions deploy manage-booking
supabase functions deploy admin-action

# release-noshows is called by the cron scheduler, not a logged-in user,
# so it must skip the default JWT gate and rely on CRON_SECRET instead:
supabase functions deploy release-noshows --no-verify-jwt
```

If you deploy by pasting code in the dashboard instead of the CLI: create each
function, and for `release-noshows` turn **off** "Verify JWT" in its settings.
You'll need to paste the `_shared` files inline since the dashboard doesn't do
shared folders — tell me and I'll give you self-contained versions.

---

## Step 3 — Enable extensions

Supabase → **Database → Extensions**, enable:

- `pg_cron` (scheduled jobs)
- `pg_net` (lets a job call an edge function)

---

## Step 4 — Run the SQL

Open `setup.sql`. Before running, replace the two placeholders in the
**no-show cron** section near the bottom:

- `REPLACE_PROJECT_REF` → `dhottawheezvotadbsqq`
- `REPLACE_CRON_SECRET` → the exact same string you set as `CRON_SECRET` in Step 1

Then paste the whole file into Supabase → **SQL Editor** and run it.

> If the `reservations_key_unique` line errors because duplicate keys already
> exist, run a manual reset first (clear reservations) then re-run that line.

This is the step that actually closes the holes: it drops the wide-open
"anything goes" policies and replaces them with read-only access, hides student
emails behind a name-only view, and schedules both jobs.

---

## Step 5 — Deploy the new `index.html`

Replace `index.html` at the root of your GitHub Pages repo with the new one and
push. (Same filename, same place as always.)

---

## Step 6 — Smoke test

1. Open the live site. The grid loads. ✅ (reads work)
2. Sign in as a student → reserve a wheel → it sticks. ✅ (manage-booking works)
3. Cancel it → the slot frees. ✅
4. Instructor → enter your **new** PIN → dashboard loads with the roster. ✅ (token works)
5. Mark someone a no-show → within ~10 min the slot releases on its own and, if
   anyone's waitlisted, they get the email. ✅ (cron + Resend work)

If the grid loads but bookings fail, the functions aren't deployed or a secret
is missing. If everything fails including the grid, the SQL ran before the site
was updated — re-check Step 4 vs Step 5 ordering.

---

## Optional hardening (later)

- **Tighten CORS.** In `_shared/cors.ts`, change `Access-Control-Allow-Origin`
  from `*` to `https://srepole-bpl.github.io`. Then redeploy the three
  user-facing functions. This stops other websites from calling your functions
  from a browser.
- **Real student auth.** Right now students identify by email lookup, so the
  server trusts the student id it's handed — someone could book as another
  student on the roster. This is the one remaining medium-severity gap. The fix
  is magic-link login (Supabase Auth) so the server knows *which* student is
  calling. Say the word and I'll wire it up — it's the natural next step.

---

## What changed, in one paragraph

Before, the public anon key could read, write, and delete every row in every
table — names, emails, reservations, the lot — because every RLS policy was
`allow everything to everyone`. The instructor "login" only hid buttons in the
browser; the destructive actions behind them ran as anon and were reachable
directly. Now the anon key can only read the grid, student emails are never
exposed to it, and every write is brokered by an edge function — with instructor
actions gated by a signed token the browser can't fake. No-show release and the
weekly reset moved to the server, so they can't get stuck or be skipped by
closing a tab.
