// When a slot frees up (student cancel, instructor cancel, or no-show release),
// this promotes the next ELIGIBLE waitlisted student into the slot and emails
// them. "Eligible" = not already holding a reservation that same day (the
// one-per-day rule). All writes happen with the service-role client, so this
// works even with RLS locked down.
import { sendWaitlistEmail } from "./email.ts";

// deno-lint-ignore no-explicit-any
export async function promoteAndNotify(db: any, slotKey: string): Promise<void> {
  const [day] = slotKey.split("|");

  const { data: wl } = await db
    .from("waitlists")
    .select("student_id, position")
    .eq("key", slotKey)
    .order("position", { ascending: true });
  if (!wl || wl.length === 0) return;

  // Who already has a reservation that day? They're not eligible.
  const { data: dayRes } = await db
    .from("reservations")
    .select("student_id")
    .like("key", `${day}|%`);
  const bookedToday = new Set((dayRes || []).map((r: { student_id: string }) => r.student_id));

  const next = wl.find((w: { student_id: string }) => !bookedToday.has(w.student_id));
  if (!next) return;

  // Claim the slot. If the unique key was filled in a race, insert fails and we stop.
  const { error: insErr } = await db
    .from("reservations")
    .insert({ key: slotKey, student_id: next.student_id });
  if (insErr) return;

  await db
    .from("waitlists")
    .delete()
    .eq("key", slotKey)
    .eq("student_id", next.student_id);

  const { data: stu } = await db
    .from("students")
    .select("name, email")
    .eq("id", next.student_id)
    .single();

  if (stu?.email) {
    await sendWaitlistEmail(db, stu.email, stu.name ?? "", slotKey);
  }
}
