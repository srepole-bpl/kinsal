// When a slot frees up (student cancel, instructor cancel, or no-show release),
// this promotes the next ELIGIBLE waitlisted student into the slot and emails
// them. "Eligible" = not already holding a reservation that same day (the
// one-per-day rule). All writes happen with the service-role client, so this
// works even with RLS locked down.
import { sendWaitlistEmail } from "./email.ts";
import { sendSms, waitlistSmsBody } from "./sms.ts";
import { getResource, nextFreeSpot } from "./resources.ts";

// deno-lint-ignore no-explicit-any
export async function promoteAndNotify(db: any, slotKey: string): Promise<void> {
  const parts = slotKey.split("|");
  const resourceId = parts[2];
  if (!resourceId) return;

  const resource = await getResource(db, resourceId);
  if (!resource) return;

  const { count } = await db
    .from("reservations")
    .select("key", { count: "exact", head: true })
    .eq("key", slotKey);
  if ((count ?? 0) >= resource.capacity) return;

  const day = parts[0];

  const { data: wl } = await db
    .from("waitlists")
    .select("student_id, position")
    .eq("key", slotKey)
    .order("position", { ascending: true });
  if (!wl || wl.length === 0) return;

  const { data: dayRes } = await db
    .from("reservations")
    .select("student_id")
    .like("key", `${day}|%`);
  const bookedToday = new Set((dayRes || []).map((r: { student_id: string }) => r.student_id));

  const next = wl.find((w: { student_id: string }) => !bookedToday.has(w.student_id));
  if (!next) return;

  const spot_index = await nextFreeSpot(db, slotKey, resource.capacity);
  if (spot_index === null) return;

  const { error: insErr } = await db
    .from("reservations")
    .insert({ key: slotKey, student_id: next.student_id, spot_index });
  if (insErr) return;

  await db
    .from("waitlists")
    .delete()
    .eq("key", slotKey)
    .eq("student_id", next.student_id);

  const { data: stu } = await db
    .from("students")
    .select("name, email, phone, sms_opt_in")
    .eq("id", next.student_id)
    .single();

  if (stu?.email) {
    await sendWaitlistEmail(db, stu.email, stu.name ?? "", slotKey);
  }

  if (stu?.sms_opt_in && stu?.phone) {
    const slotId = parts[1];
    const resourceLabel = resource.label;
    const slotLabel = slotId === "am"
      ? "morning"
      : slotId === "pm"
      ? "evening"
      : slotId;
    const first = (stu.name || "there").split(" ")[0];
    sendSms(stu.phone, waitlistSmsBody(first, day, slotLabel, resourceLabel))
      .catch((e) => console.error("waitlist sms failed:", e));
  }
}

// deno-lint-ignore no-explicit-any
export async function recompactWaitlist(db: any, slotKey: string): Promise<void> {
  const { data: remaining } = await db
    .from("waitlists")
    .select("id")
    .eq("key", slotKey)
    .order("position", { ascending: true });
  for (let i = 0; i < (remaining || []).length; i++) {
    await db.from("waitlists").update({ position: i }).eq("id", remaining[i].id);
  }
}
