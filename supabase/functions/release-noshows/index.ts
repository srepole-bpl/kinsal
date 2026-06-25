// release-noshows
// Called by pg_cron every 10 minutes. Finds no-show records older than 30
// minutes that haven't been released, frees the reserved slot, marks the
// no-show released, and promotes/emails the next waitlisted student. This
// replaces the prototype's browser setInterval, which could be defeated just by
// closing the tab.
//
// Protected by CRON_SECRET (sent as the x-cron-secret header by the cron job),
// because this function is deployed with --no-verify-jwt so the scheduler can
// reach it. Without the secret it refuses to run.
import { json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { promoteAndNotify } from "../_shared/waitlist.ts";

const RELEASE_AFTER_MIN = 30;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const provided = req.headers.get("x-cron-secret") || "";
  const expected = Deno.env.get("CRON_SECRET") || "";
  if (!expected || provided !== expected) {
    return json({ error: "forbidden" }, 403);
  }

  const db = serviceClient();
  const cutoff = new Date(Date.now() - RELEASE_AFTER_MIN * 60 * 1000).toISOString();

  const { data: due } = await db
    .from("no_shows")
    .select("key, student_id, logged_at")
    .is("released_at", null)
    .lt("logged_at", cutoff);

  let released = 0;
  for (const ns of due || []) {
    await db.from("reservations").delete().eq("key", ns.key);
    await db
      .from("no_shows")
      .update({ released_at: new Date().toISOString() })
      .eq("key", ns.key)
      .eq("student_id", ns.student_id)
      .eq("logged_at", ns.logged_at);
    await promoteAndNotify(db, ns.key);
    released++;
  }

  return json({ released });
});
