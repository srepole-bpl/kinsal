// admin-action
// EVERY privileged instructor write goes through here, and EVERY call is gated
// by verifyInstructorToken() before anything touches the database. The token is
// signed with JWT_SECRET (server-only), so a browser cannot forge it. This is
// the function that closes the catastrophic hole: previously these writes ran
// as anon, gated only by a client-side `if`.
import { json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { verifyInstructorToken } from "../_shared/jwt.ts";
import { promoteAndNotify } from "../_shared/waitlist.ts";
import {
  isValidWheelLabel,
  MAX_WHEELS,
  newWheelId,
  sanitizeWheelLabel,
} from "../_shared/wheels.ts";

const MAX_STUDENTS = 200;

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function isValidName(n: string): boolean {
  return /^[a-zA-Z\s'\-.]{2,40}$/.test(n);
}
function sanitizeName(s: string): string {
  return String(s).replace(/[<>"'&\/\\;`]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

// deno-lint-ignore no-explicit-any
async function wheelHasBookings(db: any, wheelId: string): Promise<boolean> {
  const pattern = `%|${wheelId}`;
  const { data: res } = await db.from("reservations").select("key").like("key", pattern).limit(1);
  if (res && res.length > 0) return true;
  const { data: wl } = await db.from("waitlists").select("key").like("key", pattern).limit(1);
  if (wl && wl.length > 0) return true;
  const { data: ns } = await db.from("no_shows").select("key").like("key", pattern).limit(1);
  return !!(ns && ns.length > 0);
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

  // Gate: signed instructor token required for everything below.
  if (!(await verifyInstructorToken(body.token))) {
    return json({ success: false, error: "unauthorized" }, 401);
  }

  const db = serviceClient();
  const action = String(body.action || "");

  // ── ROSTER (read full student list + stats for the dashboard) ───────────────
  if (action === "roster") {
    const { data: studs } = await db
      .from("students")
      .select("id, name, email")
      .order("name", { ascending: true });
    const { data: allRes } = await db.from("reservations").select("student_id");
    const { data: allNs } = await db
      .from("no_shows")
      .select("student_id, logged_at")
      .order("logged_at", { ascending: false });

    const resCount: Record<string, number> = {};
    (allRes || []).forEach((r: { student_id: string }) => {
      resCount[r.student_id] = (resCount[r.student_id] || 0) + 1;
    });
    const nsBy: Record<string, string[]> = {};
    (allNs || []).forEach((n: { student_id: string; logged_at: string }) => {
      (nsBy[n.student_id] = nsBy[n.student_id] || []).push(n.logged_at);
    });

    const roster = (studs || []).map((s: { id: string; name: string; email: string }) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      weeklyHours: (resCount[s.id] || 0) * 4,
      noShowCount: (nsBy[s.id] || []).length,
      lastVisit: nsBy[s.id]?.length
        ? new Date(nsBy[s.id][0]).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "no history yet",
    }));
    return json({ success: true, roster });
  }

  // ── ADD STUDENT ─────────────────────────────────────────────────────────────
  if (action === "addStudent") {
    const name = sanitizeName(body.name || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!isValidName(name)) return json({ success: false, error: "invalid name" }, 400);
    if (!isValidEmail(email)) return json({ success: false, error: "invalid email" }, 400);

    const { count } = await db.from("students").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_STUDENTS) return json({ success: false, error: "roster limit reached" }, 409);

    const { data: dupe } = await db.from("students").select("id").eq("email", email).maybeSingle();
    if (dupe) return json({ success: false, error: "email already registered" }, 409);

    const id = "s" + Date.now();
    const { error } = await db.from("students").insert({ id, name, email });
    if (error) return json({ success: false, error: "could not add student" }, 500);
    return json({ success: true, id });
  }

  // ── REMOVE STUDENT (and their reservations/waitlists) ───────────────────────
  if (action === "removeStudent") {
    const id = String(body.id || "");
    if (!id) return json({ success: false, error: "missing id" }, 400);
    await db.from("reservations").delete().eq("student_id", id);
    await db.from("waitlists").delete().eq("student_id", id);
    await db.from("students").delete().eq("id", id);
    return json({ success: true });
  }

  // ── ADMIN CANCEL ────────────────────────────────────────────────────────────
  if (action === "adminCancel") {
    const k = String(body.key || "");
    if (!k) return json({ success: false, error: "missing key" }, 400);
    await db.from("reservations").delete().eq("key", k);
    await promoteAndNotify(db, k);
    return json({ success: true });
  }

  // ── MARK NO-SHOW (release happens later via the cron job) ────────────────────
  if (action === "noShow") {
    const k = String(body.key || "");
    if (!k) return json({ success: false, error: "missing key" }, 400);
    const { data: r } = await db.from("reservations").select("student_id").eq("key", k).maybeSingle();
    if (!r) return json({ success: false, error: "no reservation on that slot" }, 404);
    await db.from("no_shows").insert({
      key: k,
      student_id: r.student_id,
      logged_at: new Date().toISOString(),
    });
    return json({ success: true });
  }

  // ── MANUAL WEEKLY RESET ─────────────────────────────────────────────────────
  if (action === "manualReset") {
    await db.from("reservations").delete().neq("key", "__none__");
    await db.from("waitlists").delete().neq("key", "__none__");
    return json({ success: true });
  }

  // ── WHEELS ───────────────────────────────────────────────────────────────────
  if (action === "getWheels") {
    const { data } = await db
      .from("wheels")
      .select("id, label, sort_order")
      .order("sort_order", { ascending: true });
    return json({ success: true, wheels: data || [] });
  }

  if (action === "saveWheels") {
    let incoming: { id?: string; label?: string }[];
    try {
      incoming = JSON.parse(String(body.wheels || "[]"));
    } catch {
      return json({ success: false, error: "invalid wheels data" }, 400);
    }
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return json({ success: false, error: "at least one wheel is required" }, 400);
    }
    if (incoming.length > MAX_WHEELS) {
      return json({ success: false, error: `maximum ${MAX_WHEELS} wheels` }, 400);
    }

    const normalized: { id: string; label: string; sort_order: number }[] = [];
    const labelsSeen = new Set<string>();

    for (let i = 0; i < incoming.length; i++) {
      const label = sanitizeWheelLabel(String(incoming[i]?.label || ""));
      if (!isValidWheelLabel(label)) {
        return json({ success: false, error: `invalid wheel name: ${label || "(empty)"}` }, 400);
      }
      const labelKey = label.toLowerCase();
      if (labelsSeen.has(labelKey)) {
        return json({ success: false, error: "wheel names must be unique" }, 409);
      }
      labelsSeen.add(labelKey);

      let id = String(incoming[i]?.id || "").trim();
      if (!id) id = newWheelId();
      normalized.push({ id, label, sort_order: i });
    }

    const { data: existing } = await db.from("wheels").select("id");
    const existingIds = new Set((existing || []).map((w: { id: string }) => w.id));
    const newIds = new Set(normalized.map((w) => w.id));

    for (const oldId of existingIds) {
      if (newIds.has(oldId)) continue;
      if (await wheelHasBookings(db, oldId)) {
        return json({
          success: false,
          error: `cannot remove wheel with active bookings or waitlists`,
        }, 409);
      }
    }

    for (const w of normalized) {
      const { error } = await db.from("wheels").upsert({
        id: w.id,
        label: w.label,
        sort_order: w.sort_order,
      });
      if (error) return json({ success: false, error: "could not save wheels" }, 500);
    }

    for (const oldId of existingIds) {
      if (!newIds.has(oldId)) {
        await db.from("wheels").delete().eq("id", oldId);
      }
    }

    const { data: wheels } = await db
      .from("wheels")
      .select("id, label, sort_order")
      .order("sort_order", { ascending: true });
    return json({ success: true, wheels: wheels || [] });
  }

  return json({ success: false, error: "unknown action" }, 400);
});
