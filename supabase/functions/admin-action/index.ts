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

  return json({ success: false, error: "unknown action" }, 400);
});
