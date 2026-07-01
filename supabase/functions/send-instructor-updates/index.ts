// send-instructor-updates
// Called by pg_cron every 5 minutes. Emails the instructor at T-30 and slot
// midpoint when the roster changed since the last notification for that window.
// Protected by CRON_SECRET.
import { json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import {
  buildSlotRosterDisplay,
  buildSlotRosterSnapshot,
  getLastNotifyHash,
  getSlotsInWindow,
  loadInstructorNotifySettings,
  recordNotifySent,
  rosterContentHash,
  rosterIsEmpty,
  sendInstructorSlotUpdateEmail,
} from "../_shared/instructor-notify.ts";
import { loadSchedule } from "../_shared/schedule.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const provided = req.headers.get("x-cron-secret") || "";
  const expected = Deno.env.get("CRON_SECRET") || "";
  if (!expected || provided !== expected) {
    return json({ error: "forbidden" }, 403);
  }

  const db = serviceClient();
  const settings = await loadInstructorNotifySettings(db);
  if (!settings.instructor_slot_notify_enabled || !settings.instructor_email) {
    return json({ sent: 0, skipped: "notifications disabled or no email" });
  }

  const schedule = await loadSchedule(db);
  const targets = getSlotsInWindow(schedule);
  let sent = 0;

  for (const target of targets) {
    const snapshot = await buildSlotRosterSnapshot(db, target.weekday, target.slotId);
    if (target.window === "pre_start" && rosterIsEmpty(snapshot)) continue;

    const hash = await rosterContentHash(snapshot);
    const lastHash = await getLastNotifyHash(db, target.occurrenceKey, target.window);
    if (lastHash === hash) continue;

    const lines = await buildSlotRosterDisplay(db, snapshot);
    const ok = await sendInstructorSlotUpdateEmail(
      settings.instructor_email,
      schedule,
      target.weekday,
      target.slotId,
      target.window,
      lines,
    );
    if (!ok) {
      console.error("instructor slot email failed for", target.occurrenceKey, target.window);
      continue;
    }

    await recordNotifySent(db, target.occurrenceKey, target.window, hash);
    sent++;
  }

  return json({ sent, windows: targets.length });
});
