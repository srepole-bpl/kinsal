// manage-booking
// All STUDENT writes go through here. Every booking rule is enforced
// server-side: valid day/slot/resource, real student, booking window (studio
// timezone), one-reservation-per-day, capacity-aware slot claim. Cancel verifies
// ownership before deleting and then promotes the waitlist.
import { json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getResource, loadResourceIds, nextFreeSpot } from "../_shared/resources.ts";
import { promoteAndNotify } from "../_shared/waitlist.ts";

const STUDIO_TZ = "America/New_York";
const STUDIO_DAYS = ["Tuesday", "Thursday", "Saturday", "Sunday"];
const SLOTS: Record<string, { start: number; end: number }> = {
  am: { start: 9, end: 13 },
  pm: { start: 16, end: 20 },
};
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function studioNow(): { dayIdx: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { dayIdx: WEEK.indexOf(wd), minutes: hh * 60 + mm };
}

function withinWindow(day: string, slotId: string): boolean {
  const sl = SLOTS[slotId];
  const target = WEEK.indexOf(day);
  if (!sl || target < 0) return false;
  const { dayIdx, minutes } = studioNow();
  if (target !== dayIdx) return false;
  const openMin = sl.start * 60 - 120;
  const closeMin = sl.end * 60 - 60;
  return minutes >= openMin && minutes < closeMin;
}

async function validSlot(
  db: ReturnType<typeof serviceClient>,
  day: string,
  slotId: string,
  resourceId: string,
): Promise<boolean> {
  if (!STUDIO_DAYS.includes(day) || !SLOTS[slotId]) return false;
  const resourceIds = await loadResourceIds(db);
  return resourceIds.has(resourceId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ success: false, error: "method not allowed" }, 405);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "bad request" }, 400);
  }

  const db = serviceClient();
  const action = String(body.action || "");

  if (action === "lookup") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) return json({ success: false, error: "invalid email" }, 400);
    const { data: stu } = await db
      .from("students")
      .select("id, name, email")
      .eq("email", email)
      .maybeSingle();
    if (!stu) return json({ success: true, found: false });
    return json({
      success: true,
      found: true,
      student: { id: stu.id, name: stu.name, email: stu.email },
    });
  }

  const studentId = String(body.studentId || "");
  const day = String(body.day || "");
  const slotId = String(body.slotId || "");
  const resourceId = String(body.resourceId || body.wheel || "");
  const k = `${day}|${slotId}|${resourceId}`;

  if (!studentId) return json({ success: false, error: "missing student" }, 400);
  if (!(await validSlot(db, day, slotId, resourceId))) {
    return json({ success: false, error: "invalid slot" }, 400);
  }

  const { data: stu } = await db
    .from("students")
    .select("id, name")
    .eq("id", studentId)
    .maybeSingle();
  if (!stu) return json({ success: false, error: "unknown student" }, 400);

  if (action === "book") {
    if (!withinWindow(day, slotId)) {
      return json({ success: false, error: "booking window is not open" }, 403);
    }
    const { data: dayRes } = await db
      .from("reservations")
      .select("key")
      .eq("student_id", studentId)
      .like("key", `${day}|%`);
    if (dayRes && dayRes.length > 0) {
      return json({ success: false, error: "you already have a reservation that day" }, 409);
    }

    const resource = await getResource(db, resourceId);
    if (!resource) return json({ success: false, error: "unknown resource" }, 400);

    const { count } = await db
      .from("reservations")
      .select("key", { count: "exact", head: true })
      .eq("key", k);
    if ((count ?? 0) >= resource.capacity) {
      return json({ success: false, error: "that slot is full" }, 409);
    }

    const spot_index = await nextFreeSpot(db, k, resource.capacity);
    if (spot_index === null) {
      return json({ success: false, error: "that slot is full" }, 409);
    }

    const { error } = await db.from("reservations").insert({
      key: k,
      student_id: studentId,
      spot_index,
    });
    if (error) return json({ success: false, error: "that slot is already taken" }, 409);
    return json({ success: true });
  }

  if (action === "cancel") {
    const { data: rows } = await db
      .from("reservations")
      .select("student_id")
      .eq("key", k)
      .eq("student_id", studentId);
    if (!rows || rows.length === 0) {
      return json({ success: false, error: "no reservation to cancel" }, 404);
    }
    await db.from("reservations").delete().eq("key", k).eq("student_id", studentId);
    await promoteAndNotify(db, k);
    return json({ success: true });
  }

  if (action === "join_waitlist") {
    const resource = await getResource(db, resourceId);
    if (!resource) return json({ success: false, error: "unknown resource" }, 400);

    const { count } = await db
      .from("reservations")
      .select("key", { count: "exact", head: true })
      .eq("key", k);
    if ((count ?? 0) < resource.capacity) {
      return json({ success: false, error: "slot is not full" }, 400);
    }

    const { data: existing } = await db
      .from("waitlists")
      .select("id")
      .eq("key", k)
      .eq("student_id", studentId);
    if (existing && existing.length > 0) {
      return json({ success: false, error: "already on this waitlist" }, 409);
    }
    const { data: wl } = await db.from("waitlists").select("id").eq("key", k);
    const position = (wl || []).length;
    const { error } = await db
      .from("waitlists")
      .insert({ key: k, student_id: studentId, position });
    if (error) return json({ success: false, error: "could not join waitlist" }, 500);
    return json({ success: true });
  }

  return json({ success: false, error: "unknown action" }, 400);
});
