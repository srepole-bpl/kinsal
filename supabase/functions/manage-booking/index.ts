// manage-booking
// All STUDENT writes go through here. Every booking rule is enforced
// server-side: valid day/slot/wheel, real student, booking window (studio
// timezone), one-reservation-per-day, and atomic slot claim. Cancel verifies
// ownership before deleting and then promotes the waitlist.
//
// NOTE: students are not yet individually authenticated (they identify by
// email lookup), so this trusts the studentId it is given. That is acceptable
// for a small roster but means the next hardening step is real student auth
// (magic link). Until then, the high-severity risks — destructive admin writes
// and unauthenticated DB access — are closed; impersonation within the roster
// is a known, documented residual.
import { json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { promoteAndNotify } from "../_shared/waitlist.ts";

const STUDIO_TZ = "America/New_York"; // change if the studio is elsewhere
const STUDIO_DAYS = ["Tuesday", "Thursday", "Saturday", "Sunday"];
const WHEELS = ["Shimpo", "Pacifica", "BHR"];
const SLOTS: Record<string, { start: number; end: number }> = {
  am: { start: 9, end: 13 },
  pm: { start: 16, end: 20 },
};
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Current wall-clock day + minutes in the studio timezone.
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

// Booking opens 2h before the slot starts, closes 1h before it ends.
// All studio slots start at 9am or later, so the window never crosses midnight.
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

function validSlot(day: string, slotId: string, wheel: string): boolean {
  return STUDIO_DAYS.includes(day) && !!SLOTS[slotId] && WHEELS.includes(wheel);
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

  // ── LOOKUP ────────────────────────────────────────────────────────────────
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
  const wheel = String(body.wheel || "");
  const k = `${day}|${slotId}|${wheel}`;

  if (!studentId) return json({ success: false, error: "missing student" }, 400);
  if (!validSlot(day, slotId, wheel)) return json({ success: false, error: "invalid slot" }, 400);

  // Confirm the student is real (and on the roster).
  const { data: stu } = await db
    .from("students")
    .select("id, name")
    .eq("id", studentId)
    .maybeSingle();
  if (!stu) return json({ success: false, error: "unknown student" }, 400);

  // ── BOOK ──────────────────────────────────────────────────────────────────
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
    // Atomic claim — relies on the UNIQUE constraint on reservations.key.
    const { error } = await db.from("reservations").insert({ key: k, student_id: studentId });
    if (error) return json({ success: false, error: "that slot is already taken" }, 409);
    return json({ success: true });
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  if (action === "cancel") {
    const { data: r } = await db
      .from("reservations")
      .select("student_id")
      .eq("key", k)
      .maybeSingle();
    if (!r) return json({ success: false, error: "no reservation to cancel" }, 404);
    if (r.student_id !== studentId) {
      return json({ success: false, error: "that reservation is not yours" }, 403);
    }
    await db.from("reservations").delete().eq("key", k);
    await promoteAndNotify(db, k);
    return json({ success: true });
  }

  // ── JOIN WAITLIST ───────────────────────────────────────────────────────────
  if (action === "join_waitlist") {
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
