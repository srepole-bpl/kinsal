// send-reminders
// Called daily by pg_cron. Sends a reminder email for reservations on tomorrow's
// studio weekday that haven't been reminded yet. Protected by CRON_SECRET.
import { json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { parseBookingKey, sendReminderEmail, tomorrowWeekday } from "../_shared/email.ts";
import { loadSchedule } from "../_shared/schedule.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const provided = req.headers.get("x-cron-secret") || "";
  const expected = Deno.env.get("CRON_SECRET") || "";
  if (!expected || provided !== expected) {
    return json({ error: "forbidden" }, 403);
  }

  const db = serviceClient();
  const schedule = await loadSchedule(db);
  const tomorrow = tomorrowWeekday(schedule.timezone);
  if (!tomorrow) return json({ sent: 0, tomorrow });

  const { data: rows } = await db
    .from("reservations")
    .select("key, student_id")
    .is("reminder_sent_at", null)
    .like("key", `${tomorrow}|%`);

  let sent = 0;
  for (const row of rows || []) {
    const booking = parseBookingKey(row.key);
    if (!booking) continue;

    const { data: stu } = await db
      .from("students")
      .select("name, email")
      .eq("id", row.student_id)
      .maybeSingle();
    if (!stu?.email) continue;

    const ok = await sendReminderEmail(
      db,
      schedule,
      stu.name ?? "",
      stu.email,
      booking,
    );
    if (!ok) {
      console.error("reminder email failed for", row.key, row.student_id);
      continue;
    }

    await db
      .from("reservations")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("key", row.key)
      .eq("student_id", row.student_id);
    sent++;
  }

  return json({ sent, tomorrow });
});
