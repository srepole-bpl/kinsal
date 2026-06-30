// admin-action
// EVERY privileged instructor write goes through here, and EVERY call is gated
// by verifyInstructorToken() before anything touches the database. The token is
// signed with JWT_SECRET (server-only), so a browser cannot forge it. This is
// the function that closes the catastrophic hole: previously these writes ran
// as anon, gated only by a client-side `if`.
import { sendBroadcastEmails } from "../_shared/email.ts";
import {
  loadAllEmailTemplates,
  parseEmailTemplatesPayload,
} from "../_shared/templates.ts";
import { writeAudit, getRecentAuditLog } from "../_shared/audit.ts";
import {
  getStoredPinHash,
  isValidPinHash,
  setStoredPinHash,
  verifyPinHash,
} from "../_shared/pin.ts";
import { json, preflight, rejectForeignOrigin } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { verifyInstructorToken } from "../_shared/jwt.ts";
import { promoteAndNotify } from "../_shared/waitlist.ts";
import {
  loadSchedule,
  parseSchedulePayload,
} from "../_shared/schedule.ts";
import {
  csvEscape,
  incrementNoShowCount,
  isBookingBlocked,
  loadStudioLimits,
  parseCsvLine,
  parseLimitsPayload,
} from "../_shared/limits.ts";
import {
  loadClosedDays,
  loadSlotBlocks,
  parseBlockPayload,
  parseClosedDaysPayload,
} from "../_shared/blocks.ts";
import {
  maxConcurrentBookingsForResource,
  parseResourcePayload,
  parseRoomPayload,
  resourceHasBookings,
} from "../_shared/resources.ts";
import {
  isValidWheelLabel,
  MAX_WHEELS,
  newWheelId,
  sanitizeWheelLabel,
} from "../_shared/wheels.ts";

const MAX_STUDENTS = 200;
const BROADCAST_COOLDOWN_MS = 60_000;

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
  return resourceHasBookings(db, wheelId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req.headers.get("Origin") ?? "");
  const foreign = rejectForeignOrigin(req);
  if (foreign) return foreign;
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

  if (action === "getAuditLog") {
    const limit = parseInt(String(body.limit || "50"), 10);
    const entries = await getRecentAuditLog(db, limit);
    return json({ success: true, entries });
  }

  if (action === "changePin") {
    const currentPinHash = String(body.currentPinHash || "");
    const newPinHash = String(body.newPinHash || "");
    if (!isValidPinHash(currentPinHash) || !isValidPinHash(newPinHash)) {
      return json({ success: false, error: "invalid pin format" }, 400);
    }
    const stored = await getStoredPinHash(db);
    if (!stored) return json({ success: false, error: "server not configured" }, 500);
    if (!verifyPinHash(currentPinHash, stored)) {
      return json({ success: false, error: "current pin is incorrect" }, 401);
    }
    if (verifyPinHash(currentPinHash, newPinHash)) {
      return json({ success: false, error: "new pin must be different" }, 400);
    }
    await setStoredPinHash(db, newPinHash);
    await writeAudit(db, "instructor", "change_pin", {});
    return json({ success: true });
  }

  if (action === "getEmailTemplates") {
    const templates = await loadAllEmailTemplates(db);
    return json({ success: true, templates });
  }

  if (action === "saveEmailTemplates") {
    let incoming: unknown;
    try {
      incoming = JSON.parse(String(body.templates || "[]"));
    } catch {
      return json({ success: false, error: "invalid templates data" }, 400);
    }
    const parsed = parseEmailTemplatesPayload(incoming);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);

    for (const template of parsed.templates) {
      const { error } = await db.from("email_templates").upsert({
        key: template.key,
        subject: template.subject,
        body_html: template.body_html,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ success: false, error: "could not save templates" }, 500);
    }

    await writeAudit(db, "instructor", "save_email_templates", {
      keys: parsed.templates.map((t) => t.key),
    });
    const templates = await loadAllEmailTemplates(db);
    return json({ success: true, templates });
  }

  if (action === "broadcastEmail") {
    const subject = String(body.subject || "").trim();
    const bodyHtml = String(body.body || body.bodyHtml || "").trim();
    if (!subject || subject.length > 200) {
      return json({ success: false, error: "invalid subject" }, 400);
    }
    if (!bodyHtml || bodyHtml.length > 10000) {
      return json({ success: false, error: "invalid body" }, 400);
    }

    const { data: settings } = await db
      .from("studio_settings")
      .select("last_broadcast_at")
      .eq("id", 1)
      .maybeSingle();
    if (settings?.last_broadcast_at) {
      const elapsed = Date.now() - new Date(settings.last_broadcast_at).getTime();
      if (elapsed < BROADCAST_COOLDOWN_MS) {
        return json({
          success: false,
          error: "please wait at least 1 minute between broadcasts",
        }, 429);
      }
    }

    const { data: studs } = await db
      .from("students")
      .select("name, email")
      .not("email", "is", null);
    const recipients = (studs || []).filter((s: { email?: string }) =>
      String(s.email || "").trim().length > 0
    ) as { name: string; email: string }[];

    if (recipients.length === 0) {
      return json({ success: false, error: "no students with email on roster" }, 400);
    }

    await db.from("studio_settings").update({
      last_broadcast_at: new Date().toISOString(),
    }).eq("id", 1);

    const { sent, failed } = await sendBroadcastEmails(recipients, subject, bodyHtml);
    await writeAudit(db, "instructor", "broadcast_email", {
      subject,
      sent,
      failed,
      total: recipients.length,
    });
    return json({ success: true, sent, failed, total: recipients.length });
  }

  // ── ROSTER (read full student list + stats for the dashboard) ───────────────
  if (action === "roster") {
    const { data: studs } = await db
      .from("students")
      .select("id, name, email, booking_blocked_until, no_show_count")
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

    const roster = (studs || []).map((s: {
      id: string;
      name: string;
      email: string;
      booking_blocked_until: string | null;
      no_show_count: number;
    }) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      weeklyHours: (resCount[s.id] || 0) * 4,
      noShowCount: s.no_show_count ?? 0,
      bookingBlocked: isBookingBlocked(s.booking_blocked_until),
      lastVisit: nsBy[s.id]?.length
        ? new Date(nsBy[s.id][0]).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "no history yet",
    }));
    return json({ success: true, roster });
  }

  // ── ROSTER CSV ──────────────────────────────────────────────────────────────
  if (action === "exportRoster") {
    const { data: studs } = await db
      .from("students")
      .select("name, email")
      .order("name", { ascending: true });
    const lines = ["name,email", ...(studs || []).map((s: { name: string; email: string }) =>
      `${csvEscape(s.name)},${csvEscape(s.email)}`)];
    return json({ success: true, csv: lines.join("\n") });
  }

  if (action === "importRoster") {
    const csv = String(body.csv || "");
    if (!csv.trim()) return json({ success: false, error: "empty csv" }, 400);

    const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim());
    let start = 0;
    const first = parseCsvLine(lines[0]);
    if (first.length >= 2 && /^name$/i.test(first[0]) && /^email$/i.test(first[1])) {
      start = 1;
    }

    const { count: existingCount } = await db
      .from("students")
      .select("id", { count: "exact", head: true });
    let added = 0;
    const skipped: string[] = [];

    for (let i = start; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 2) {
        skipped.push(`row ${i + 1}: missing columns`);
        continue;
      }
      const name = sanitizeName(cols[0]);
      const email = String(cols[1]).trim().toLowerCase();
      if (!isValidName(name)) {
        skipped.push(`row ${i + 1}: invalid name`);
        continue;
      }
      if (!isValidEmail(email)) {
        skipped.push(`row ${i + 1}: invalid email`);
        continue;
      }
      const { data: dupe } = await db.from("students").select("id").eq("email", email).maybeSingle();
      if (dupe) {
        skipped.push(`row ${i + 1}: ${email} already registered`);
        continue;
      }
      if ((existingCount ?? 0) + added >= MAX_STUDENTS) {
        skipped.push(`row ${i + 1}: roster limit reached`);
        continue;
      }
      const id = "s" + Date.now() + i;
      const { error } = await db.from("students").insert({ id, name, email });
      if (error) {
        skipped.push(`row ${i + 1}: could not add`);
        continue;
      }
      added++;
    }

    await writeAudit(db, "instructor", "import_roster", { added, skipped: skipped.length });
    return json({ success: true, added, skipped });
  }

  if (action === "exportBookings") {
    const { data: resRows } = await db.from("reservations").select("key, student_id").order("key");
    const { data: studs } = await db.from("students").select("id, name, email");
    const { data: resList } = await db.from("resources").select("id, label");
    const studMap: Record<string, { name: string; email: string }> = {};
    (studs || []).forEach((s: { id: string; name: string; email: string }) => {
      studMap[s.id] = { name: s.name, email: s.email };
    });
    const resMap: Record<string, string> = {};
    (resList || []).forEach((r: { id: string; label: string }) => {
      resMap[r.id] = r.label;
    });

    const lines = ["day,slot,resource,resource_label,student_name,student_email"];
    for (const row of resRows || []) {
      const [day, slot, resourceId] = String(row.key).split("|");
      const stu = studMap[row.student_id];
      lines.push([
        csvEscape(day),
        csvEscape(slot),
        csvEscape(resourceId),
        csvEscape(resMap[resourceId] || resourceId),
        csvEscape(stu?.name || ""),
        csvEscape(stu?.email || ""),
      ].join(","));
    }
    return json({ success: true, csv: lines.join("\n") });
  }

  if (action === "clearNoShowBlock") {
    const id = String(body.id || body.studentId || "");
    if (!id) return json({ success: false, error: "missing id" }, 400);
    await db.from("students").update({ booking_blocked_until: null }).eq("id", id);
    await writeAudit(db, "instructor", "clear_no_show_block", { studentId: id });
    return json({ success: true });
  }

  if (action === "getLimits") {
    const limits = await loadStudioLimits(db);
    return json({ success: true, ...limits });
  }

  if (action === "saveLimits") {
    const parsed = parseLimitsPayload(body.maxBookingsPerWeek, body.noShowThreshold);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);
    const { error } = await db.from("studio_settings").update({
      max_bookings_per_week: parsed.limits.max_bookings_per_week,
      no_show_threshold: parsed.limits.no_show_threshold,
    }).eq("id", 1);
    if (error) return json({ success: false, error: "could not save limits" }, 500);
    await writeAudit(db, "instructor", "save_limits", parsed.limits);
    return json({ success: true, ...parsed.limits });
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
    await writeAudit(db, "instructor", "add_student", { id, email });
    return json({ success: true, id });
  }

  // ── REMOVE STUDENT (and their reservations/waitlists) ───────────────────────
  if (action === "removeStudent") {
    const id = String(body.id || "");
    if (!id) return json({ success: false, error: "missing id" }, 400);
    await db.from("reservations").delete().eq("student_id", id);
    await db.from("waitlists").delete().eq("student_id", id);
    await db.from("students").delete().eq("id", id);
    await writeAudit(db, "instructor", "remove_student", { id });
    return json({ success: true });
  }

  // ── ADMIN CANCEL ────────────────────────────────────────────────────────────
  if (action === "adminCancel") {
    const k = String(body.key || "");
    const studentId = String(body.studentId || "");
    if (!k) return json({ success: false, error: "missing key" }, 400);
    if (studentId) {
      await db.from("reservations").delete().eq("key", k).eq("student_id", studentId);
    } else {
      await db.from("reservations").delete().eq("key", k);
    }
    await promoteAndNotify(db, k);
    await writeAudit(db, "instructor", "admin_cancel", { key: k, studentId: studentId || null });
    return json({ success: true });
  }

  // ── MARK NO-SHOW (release happens later via the cron job) ────────────────────
  if (action === "noShow") {
    const k = String(body.key || "");
    const studentId = String(body.studentId || "");
    if (!k) return json({ success: false, error: "missing key" }, 400);
    let query = db.from("reservations").select("student_id").eq("key", k);
    if (studentId) query = query.eq("student_id", studentId);
    const { data: r } = await query.limit(1).maybeSingle();
    if (!r) return json({ success: false, error: "no reservation on that slot" }, 404);
    await db.from("no_shows").insert({
      key: k,
      student_id: r.student_id,
      logged_at: new Date().toISOString(),
    });
    await writeAudit(db, "instructor", "no_show", { key: k, studentId: r.student_id });
    return json({ success: true });
  }

  // ── MANUAL WEEKLY RESET ─────────────────────────────────────────────────────
  if (action === "manualReset") {
    await db.from("reservations").delete().neq("key", "__none__");
    await db.from("waitlists").delete().neq("key", "__none__");
    await writeAudit(db, "instructor", "manual_reset", {});
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
    await writeAudit(db, "instructor", "save_wheels", { count: (wheels || []).length });
    return json({ success: true, wheels: wheels || [] });
  }

  // ── ROOMS ────────────────────────────────────────────────────────────────────
  if (action === "getRooms") {
    const { data } = await db
      .from("rooms")
      .select("id, label, sort_order")
      .order("sort_order", { ascending: true });
    return json({ success: true, rooms: data || [] });
  }

  if (action === "saveRooms") {
    let incoming: unknown;
    try {
      incoming = JSON.parse(String(body.rooms || "[]"));
    } catch {
      return json({ success: false, error: "invalid rooms data" }, 400);
    }
    const parsed = parseRoomPayload(incoming);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);

    const { data: existing } = await db.from("rooms").select("id");
    const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
    const newIds = new Set(parsed.rooms.map((r) => r.id));

    for (const oldId of existingIds) {
      if (newIds.has(oldId)) continue;
      const { count } = await db
        .from("resources")
        .select("id", { count: "exact", head: true })
        .eq("room_id", oldId);
      if ((count ?? 0) > 0) {
        return json({
          success: false,
          error: "cannot remove a room that still has resources",
        }, 409);
      }
    }

    for (const room of parsed.rooms) {
      const { error } = await db.from("rooms").upsert({
        id: room.id,
        label: room.label,
        sort_order: room.sort_order,
      });
      if (error) return json({ success: false, error: "could not save rooms" }, 500);
    }

    for (const oldId of existingIds) {
      if (!newIds.has(oldId)) {
        await db.from("rooms").delete().eq("id", oldId);
      }
    }

    const { data: rooms } = await db
      .from("rooms")
      .select("id, label, sort_order")
      .order("sort_order", { ascending: true });
    await writeAudit(db, "instructor", "save_rooms", { count: (rooms || []).length });
    return json({ success: true, rooms: rooms || [] });
  }

  // ── RESOURCES ────────────────────────────────────────────────────────────────
  if (action === "getResources") {
    const { data } = await db
      .from("resources")
      .select("id, room_id, label, category, capacity, sort_order")
      .order("sort_order", { ascending: true });
    return json({ success: true, resources: data || [] });
  }

  if (action === "saveResources") {
    let incoming: unknown;
    try {
      incoming = JSON.parse(String(body.resources || "[]"));
    } catch {
      return json({ success: false, error: "invalid resources data" }, 400);
    }
    const parsed = parseResourcePayload(incoming);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);

    const roomIds = new Set(parsed.resources.map((r) => r.room_id));
    const { data: dbRooms } = await db.from("rooms").select("id");
    const validRoomIds = new Set((dbRooms || []).map((r: { id: string }) => r.id));
    for (const rid of roomIds) {
      if (!validRoomIds.has(rid)) {
        return json({ success: false, error: "resource references unknown room" }, 400);
      }
    }

    const { data: existing } = await db.from("resources").select("id, capacity");
    const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
    const newIds = new Set(parsed.resources.map((r) => r.id));

    for (const res of parsed.resources) {
      if (!existingIds.has(res.id)) continue;
      const maxBooked = await maxConcurrentBookingsForResource(db, res.id);
      if (res.capacity < maxBooked) {
        return json({
          success: false,
          error: `cannot reduce seats below current bookings (${maxBooked} booked) for ${res.label}`,
        }, 409);
      }
    }

    for (const oldId of existingIds) {
      if (newIds.has(oldId)) continue;
      if (await resourceHasBookings(db, oldId)) {
        return json({
          success: false,
          error: "cannot remove resource with active bookings or waitlists",
        }, 409);
      }
    }

    for (const res of parsed.resources) {
      const { error } = await db.from("resources").upsert({
        id: res.id,
        room_id: res.room_id,
        label: res.label,
        category: res.category,
        capacity: res.capacity,
        sort_order: res.sort_order,
      });
      if (error) return json({ success: false, error: "could not save resources" }, 500);
    }

    for (const oldId of existingIds) {
      if (!newIds.has(oldId)) {
        await db.from("resources").delete().eq("id", oldId);
      }
    }

    const { data: resources } = await db
      .from("resources")
      .select("id, room_id, label, category, capacity, sort_order")
      .order("sort_order", { ascending: true });
    await writeAudit(db, "instructor", "save_resources", { count: (resources || []).length });
    return json({ success: true, resources: resources || [] });
  }

  // ── SCHEDULE ─────────────────────────────────────────────────────────────────
  if (action === "getSchedule") {
    const schedule = await loadSchedule(db);
    return json({ success: true, ...schedule });
  }

  if (action === "saveSchedule") {
    let daysIn: unknown;
    let slotsIn: unknown;
    try {
      daysIn = JSON.parse(String(body.days || "[]"));
      slotsIn = JSON.parse(String(body.slots || "[]"));
    } catch {
      return json({ success: false, error: "invalid schedule data" }, 400);
    }
    const timezone = String(body.timezone || "America/New_York").trim();
    const parsed = parseSchedulePayload(daysIn, slotsIn, timezone);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);

    const { schedule } = parsed;

    await db.from("studio_settings").upsert({ id: 1, timezone: schedule.timezone });

    const { data: existingDays } = await db.from("studio_days").select("weekday");
    const newDaySet = new Set(schedule.days.map((d) => d.weekday));
    for (const old of existingDays || []) {
      if (!newDaySet.has(old.weekday)) {
        await db.from("studio_days").delete().eq("weekday", old.weekday);
      }
    }
    for (const day of schedule.days) {
      const { error } = await db.from("studio_days").upsert({
        weekday: day.weekday,
        sort_order: day.sort_order,
      });
      if (error) return json({ success: false, error: "could not save studio days" }, 500);
    }

    const { data: existingSlots } = await db.from("schedule_slots").select("id");
    const newSlotSet = new Set(schedule.slots.map((s) => s.id));
    for (const old of existingSlots || []) {
      if (!newSlotSet.has(old.id)) {
        await db.from("schedule_slots").delete().eq("id", old.id);
      }
    }
    for (const slot of schedule.slots) {
      const { error } = await db.from("schedule_slots").upsert({
        id: slot.id,
        label: slot.label,
        start_hour: slot.start_hour,
        end_hour: slot.end_hour,
        open_offset_minutes: slot.open_offset_minutes,
        close_offset_minutes: slot.close_offset_minutes,
        sort_order: slot.sort_order,
      });
      if (error) return json({ success: false, error: "could not save time slots" }, 500);
    }

    await writeAudit(db, "instructor", "save_schedule", {
      days: schedule.days.length,
      slots: schedule.slots.length,
      timezone: schedule.timezone,
    });
    return json({ success: true, ...schedule });
  }

  // ── SLOT BLOCKS ────────────────────────────────────────────────────────────
  if (action === "getBlocks") {
    const blocks = await loadSlotBlocks(db);
    return json({ success: true, blocks });
  }

  if (action === "saveBlocks") {
    let incoming: unknown;
    try {
      incoming = JSON.parse(String(body.blocks || "[]"));
    } catch {
      return json({ success: false, error: "invalid blocks data" }, 400);
    }
    const parsed = parseBlockPayload(incoming);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);

    await db.from("slot_blocks").delete().neq("id", -1);
    for (const block of parsed.blocks) {
      const { error } = await db.from("slot_blocks").insert(block);
      if (error) return json({ success: false, error: "could not save blocks" }, 500);
    }

    const blocks = await loadSlotBlocks(db);
    await writeAudit(db, "instructor", "save_blocks", { count: blocks.length });
    return json({ success: true, blocks });
  }

  // ── CLOSED DAYS ──────────────────────────────────────────────────────────────
  if (action === "getClosedDays") {
    const closedDays = await loadClosedDays(db);
    return json({ success: true, closedDays });
  }

  if (action === "saveClosedDays") {
    let incoming: unknown;
    try {
      incoming = JSON.parse(String(body.closedDays || "[]"));
    } catch {
      return json({ success: false, error: "invalid closed days data" }, 400);
    }
    const parsed = parseClosedDaysPayload(incoming);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);

    await db.from("closed_days").delete().neq("date", "1900-01-01");
    for (const day of parsed.days) {
      const { error } = await db.from("closed_days").insert(day);
      if (error) return json({ success: false, error: "could not save closed days" }, 500);
    }

    const closedDays = await loadClosedDays(db);
    await writeAudit(db, "instructor", "save_closed_days", { count: closedDays.length });
    return json({ success: true, closedDays });
  }

  return json({ success: false, error: "unknown action" }, 400);
});
