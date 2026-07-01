import type { ScheduleSlot, StudioSchedule } from "./types/domain.ts";
import { slotTimeLabel, sendEmail } from "./email.ts";
import { resourceLabelForId } from "./resources.ts";
import { studioNow } from "./schedule.ts";

export type NotifyWindow = "pre_start" | "midpoint";

const WINDOW_TOLERANCE_MIN = 5;

export interface SlotWindowTarget {
  occurrenceKey: string;
  weekday: string;
  slotId: string;
  window: NotifyWindow;
  slot: ScheduleSlot;
}

export interface InstructorNotifySettings {
  instructor_email: string | null;
  instructor_slot_notify_enabled: boolean;
}

export interface RosterBooking {
  key: string;
  student_id: string;
  resource_id: string;
  spot_index: number;
}

export interface RosterWaitlist {
  key: string;
  student_id: string;
  position: number;
}

export interface SlotRosterSnapshot {
  reservations: RosterBooking[];
  waitlists: RosterWaitlist[];
}

export interface SlotRosterDisplayLine {
  resourceLabel: string;
  bookings: { name: string; email: string }[];
  waitlist: string[];
}

// deno-lint-ignore no-explicit-any
export async function loadInstructorNotifySettings(db: any): Promise<InstructorNotifySettings> {
  const { data } = await db
    .from("studio_settings")
    .select("instructor_email, instructor_slot_notify_enabled")
    .eq("id", 1)
    .maybeSingle();
  return {
    instructor_email: data?.instructor_email ? String(data.instructor_email).trim() : null,
    instructor_slot_notify_enabled: data?.instructor_slot_notify_enabled !== false,
  };
}

export function studioCalendarDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export function studioWeekday(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "weekday")?.value ?? "";
}

function inWindow(currentMin: number, targetMin: number): boolean {
  return Math.abs(currentMin - targetMin) <= WINDOW_TOLERANCE_MIN;
}

export function getSlotsInWindow(schedule: StudioSchedule): SlotWindowTarget[] {
  const today = studioWeekday(schedule.timezone);
  if (!schedule.days.some((d) => d.weekday === today)) return [];

  const { minutes } = studioNow(schedule.timezone);
  const date = studioCalendarDate(schedule.timezone);
  const targets: SlotWindowTarget[] = [];

  for (const slot of schedule.slots) {
    const preStartMin = slot.start_hour * 60 - 30;
    const midMin = Math.floor((slot.start_hour * 60 + slot.end_hour * 60) / 2);
    const occurrenceKey = `${date}|${today}|${slot.id}`;

    if (inWindow(minutes, preStartMin)) {
      targets.push({
        occurrenceKey,
        weekday: today,
        slotId: slot.id,
        window: "pre_start",
        slot,
      });
    }
    if (inWindow(minutes, midMin)) {
      targets.push({
        occurrenceKey,
        weekday: today,
        slotId: slot.id,
        window: "midpoint",
        slot,
      });
    }
  }

  return targets;
}

// deno-lint-ignore no-explicit-any
export async function buildSlotRosterSnapshot(
  db: any,
  weekday: string,
  slotId: string,
): Promise<SlotRosterSnapshot> {
  const prefix = `${weekday}|${slotId}|`;

  const { data: resRows } = await db
    .from("reservations")
    .select("key, student_id, spot_index")
    .like("key", `${prefix}%`);

  const { data: wlRows } = await db
    .from("waitlists")
    .select("key, student_id, position")
    .like("key", `${prefix}%`)
    .order("position", { ascending: true });

  const reservations: RosterBooking[] = (resRows || []).map((r: {
    key: string;
    student_id: string;
    spot_index: number;
  }) => ({
    key: r.key,
    student_id: r.student_id,
    resource_id: r.key.split("|")[2] ?? "",
    spot_index: r.spot_index ?? 0,
  })).sort((a, b) =>
    a.key.localeCompare(b.key) || a.student_id.localeCompare(b.student_id)
  );

  const waitlists: RosterWaitlist[] = (wlRows || []).map((w: {
    key: string;
    student_id: string;
    position: number;
  }) => ({
    key: w.key,
    student_id: w.student_id,
    position: w.position ?? 0,
  })).sort((a, b) =>
    a.key.localeCompare(b.key) || a.position - b.position || a.student_id.localeCompare(b.student_id)
  );

  return { reservations, waitlists };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function rosterContentHash(snapshot: SlotRosterSnapshot): Promise<string> {
  return sha256Hex(JSON.stringify(snapshot));
}

export function rosterIsEmpty(snapshot: SlotRosterSnapshot): boolean {
  return snapshot.reservations.length === 0 && snapshot.waitlists.length === 0;
}

// deno-lint-ignore no-explicit-any
export async function getLastNotifyHash(
  db: any,
  occurrenceKey: string,
  window: NotifyWindow,
): Promise<string | null> {
  if (window === "pre_start") {
    const { data } = await db
      .from("instructor_slot_notify_log")
      .select("content_hash")
      .eq("occurrence_key", occurrenceKey)
      .eq("notify_window", "pre_start")
      .maybeSingle();
    return data?.content_hash ?? null;
  }

  const { data } = await db
    .from("instructor_slot_notify_log")
    .select("content_hash")
    .eq("occurrence_key", occurrenceKey)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.content_hash ?? null;
}

// deno-lint-ignore no-explicit-any
export async function recordNotifySent(
  db: any,
  occurrenceKey: string,
  window: NotifyWindow,
  contentHash: string,
): Promise<void> {
  await db.from("instructor_slot_notify_log").upsert({
    occurrence_key: occurrenceKey,
    notify_window: window,
    content_hash: contentHash,
    sent_at: new Date().toISOString(),
  });
}

// deno-lint-ignore no-explicit-any
export async function buildSlotRosterDisplay(
  db: any,
  snapshot: SlotRosterSnapshot,
): Promise<SlotRosterDisplayLine[]> {
  const studentIds = new Set<string>();
  snapshot.reservations.forEach((r) => studentIds.add(r.student_id));
  snapshot.waitlists.forEach((w) => studentIds.add(w.student_id));

  const studMap: Record<string, { name: string; email: string }> = {};
  if (studentIds.size > 0) {
    const { data: studs } = await db
      .from("students")
      .select("id, name, email")
      .in("id", [...studentIds]);
    (studs || []).forEach((s: { id: string; name: string; email: string }) => {
      studMap[s.id] = { name: s.name, email: s.email ?? "" };
    });
  }

  const keys = new Set<string>();
  snapshot.reservations.forEach((r) => keys.add(r.key));
  snapshot.waitlists.forEach((w) => keys.add(w.key));

  const lines: SlotRosterDisplayLine[] = [];
  for (const key of [...keys].sort()) {
    const resourceId = key.split("|")[2] ?? "";
    if (!resourceId) continue;
    const resourceLabel = await resourceLabelForId(db, resourceId);

    const bookings = snapshot.reservations
      .filter((r) => r.key === key)
      .map((r) => {
        const stu = studMap[r.student_id];
        return { name: stu?.name ?? r.student_id, email: stu?.email ?? "" };
      });

    const waitlist = snapshot.waitlists
      .filter((w) => w.key === key)
      .sort((a, b) => a.position - b.position)
      .map((w) => studMap[w.student_id]?.name ?? w.student_id);

    lines.push({ resourceLabel, bookings, waitlist });
  }

  return lines;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendInstructorSlotUpdateEmail(
  to: string,
  schedule: StudioSchedule,
  weekday: string,
  slotId: string,
  window: NotifyWindow,
  lines: SlotRosterDisplayLine[],
): Promise<boolean> {
  const slotLabel = slotTimeLabel(schedule, slotId);
  const bookedCount = lines.reduce((n, l) => n + l.bookings.length, 0);
  const wlCount = lines.reduce((n, l) => n + l.waitlist.length, 0);
  const whenLabel = window === "pre_start" ? "30 minutes before start" : "mid-session update";

  const bodyParts = lines.map((line) => {
    const bookedHtml = line.bookings.length
      ? `<ul style="margin:4px 0 8px 18px;padding:0">${line.bookings.map((b) =>
        `<li>${escapeHtml(b.name)}${b.email ? ` · ${escapeHtml(b.email)}` : ""}</li>`
      ).join("")}</ul>`
      : `<p style="margin:4px 0 8px;color:#9c8e7c;font-size:13px">no bookings</p>`;
    const wlHtml = line.waitlist.length
      ? `<p style="margin:0 0 8px;font-size:12px;color:#7a4800">waitlist: ${line.waitlist.map(escapeHtml).join(", ")}</p>`
      : "";
    return `<p style="margin:12px 0 4px;font-weight:500">${escapeHtml(line.resourceLabel)}</p>${bookedHtml}${wlHtml}`;
  }).join("");

  const subject = `update: ${weekday} ${schedule.slots.find((s) => s.id === slotId)?.label ?? slotId} — ${bookedCount} booked${wlCount ? `, ${wlCount} waitlist` : ""}`;

  const html = `<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>studio roster update (${escapeHtml(whenLabel)}):</p>
    <p><strong>${escapeHtml(weekday)}</strong><br>${escapeHtml(slotLabel)}</p>
    ${bodyParts || "<p>no active bookings or waitlists.</p>"}
    <p style="color:#9c8e7c;font-size:13px;margin-top:16px">this email was sent because the roster changed since your last update for this class.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma's studio</p>
  </div>`;

  return sendEmail(to, subject, html);
}

export function parseInstructorNotifyPayload(
  emailIn: unknown,
  enabledIn: unknown,
): { ok: true; instructor_email: string | null; instructor_slot_notify_enabled: boolean } | { ok: false; error: string } {
  const enabled = enabledIn === true || enabledIn === "true" || enabledIn === 1 || enabledIn === "1";
  const disabled = enabledIn === false || enabledIn === "false" || enabledIn === 0 || enabledIn === "0";
  const instructor_slot_notify_enabled = disabled ? false : (enabled || enabledIn === undefined);

  const raw = emailIn === null || emailIn === undefined ? "" : String(emailIn).trim().toLowerCase();
  if (!raw) {
    return { ok: true, instructor_email: null, instructor_slot_notify_enabled };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return { ok: false, error: "invalid instructor email" };
  }
  return { ok: true, instructor_email: raw, instructor_slot_notify_enabled };
}
