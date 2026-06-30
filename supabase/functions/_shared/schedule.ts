import type { ScheduleSlot, StudioDay, StudioSchedule } from "./types/domain.ts";

const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULT_SCHEDULE: StudioSchedule = {
  timezone: "America/New_York",
  days: [
    { weekday: "Tuesday", sort_order: 0 },
    { weekday: "Thursday", sort_order: 1 },
    { weekday: "Saturday", sort_order: 2 },
    { weekday: "Sunday", sort_order: 3 },
  ],
  slots: [
    {
      id: "am",
      label: "morning",
      start_hour: 9,
      end_hour: 13,
      open_offset_minutes: -120,
      close_offset_minutes: -60,
      sort_order: 0,
    },
    {
      id: "pm",
      label: "evening",
      start_hour: 16,
      end_hour: 20,
      open_offset_minutes: -120,
      close_offset_minutes: -60,
      sort_order: 1,
    },
  ],
};

// deno-lint-ignore no-explicit-any
export async function loadSchedule(db: any): Promise<StudioSchedule> {
  const { data: settings } = await db.from("studio_settings").select("timezone").eq("id", 1).maybeSingle();
  const { data: days } = await db.from("studio_days").select("weekday, sort_order").order("sort_order");
  const { data: slots } = await db.from("schedule_slots").select("*").order("sort_order");

  if ((!days || days.length === 0) && (!slots || slots.length === 0)) {
    return DEFAULT_SCHEDULE;
  }

  return {
    timezone: settings?.timezone ?? DEFAULT_SCHEDULE.timezone,
    days: (days && days.length > 0 ? days : DEFAULT_SCHEDULE.days) as StudioDay[],
    slots: (slots && slots.length > 0 ? slots : DEFAULT_SCHEDULE.slots) as ScheduleSlot[],
  };
}

export function studioNow(timezone: string): { dayIdx: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
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

export function isBookingOpen(
  schedule: StudioSchedule,
  day: string,
  slotId: string,
): boolean {
  const slot = schedule.slots.find((s) => s.id === slotId);
  const target = WEEK.indexOf(day);
  if (!slot || target < 0) return false;
  if (!schedule.days.some((d) => d.weekday === day)) return false;

  const { dayIdx, minutes } = studioNow(schedule.timezone);
  if (target !== dayIdx) return false;

  const openMin = slot.start_hour * 60 + slot.open_offset_minutes;
  const closeMin = slot.end_hour * 60 + slot.close_offset_minutes;
  return minutes >= openMin && minutes < closeMin;
}

export function slotsOverlap(a: ScheduleSlot, b: ScheduleSlot): boolean {
  if (a.id === b.id) return false;
  return a.start_hour < b.end_hour && b.start_hour < a.end_hour;
}

const VALID_WEEKDAYS = new Set(WEEK);

export function parseSchedulePayload(
  daysIn: unknown,
  slotsIn: unknown,
  timezone: string,
): { ok: true; schedule: StudioSchedule } | { ok: false; error: string } {
  if (!timezone || timezone.length < 3) {
    return { ok: false, error: "invalid timezone" };
  }

  if (!Array.isArray(daysIn) || daysIn.length === 0) {
    return { ok: false, error: "at least one studio day is required" };
  }
  if (!Array.isArray(slotsIn) || slotsIn.length === 0) {
    return { ok: false, error: "at least one time slot is required" };
  }

  const days: StudioDay[] = [];
  const weekdaysSeen = new Set<string>();

  for (let i = 0; i < daysIn.length; i++) {
    const raw = daysIn[i] as Record<string, unknown>;
    const weekday = String(raw?.weekday || "").trim();
    if (!VALID_WEEKDAYS.has(weekday)) {
      return { ok: false, error: `invalid weekday: ${weekday || "(empty)"}` };
    }
    if (weekdaysSeen.has(weekday)) {
      return { ok: false, error: "duplicate studio days" };
    }
    weekdaysSeen.add(weekday);
    days.push({ weekday, sort_order: i });
  }

  const slots: ScheduleSlot[] = [];
  const idsSeen = new Set<string>();

  for (let i = 0; i < slotsIn.length; i++) {
    const raw = slotsIn[i] as Record<string, unknown>;
    const id = String(raw?.id || "").trim() || `slot${Date.now()}${i}`;
    const label = String(raw?.label || "").trim();
    const start_hour = parseInt(String(raw?.start_hour ?? ""), 10);
    const end_hour = parseInt(String(raw?.end_hour ?? ""), 10);
    const open_offset_minutes = parseInt(String(raw?.open_offset_minutes ?? -120), 10);
    const close_offset_minutes = parseInt(String(raw?.close_offset_minutes ?? -60), 10);

    if (!label || label.length > 40) {
      return { ok: false, error: "each slot needs a label (2–40 chars)" };
    }
    if (Number.isNaN(start_hour) || Number.isNaN(end_hour) || start_hour >= end_hour) {
      return { ok: false, error: `invalid hours for slot ${label}` };
    }
    if (start_hour < 0 || end_hour > 24) {
      return { ok: false, error: `hours must be between 0 and 24 for ${label}` };
    }
    if (idsSeen.has(id)) {
      return { ok: false, error: "duplicate slot ids" };
    }
    idsSeen.add(id);

    slots.push({
      id,
      label,
      start_hour,
      end_hour,
      open_offset_minutes,
      close_offset_minutes,
      sort_order: i,
    });
  }

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (slotsOverlap(slots[i], slots[j])) {
        return { ok: false, error: "time slots cannot overlap" };
      }
    }
  }

  return { ok: true, schedule: { timezone, days, slots } };
}
