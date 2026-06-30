export interface StudioLimits {
  max_bookings_per_week: number;
  no_show_threshold: number;
}

const DEFAULT_LIMITS: StudioLimits = {
  max_bookings_per_week: 4,
  no_show_threshold: 3,
};

// deno-lint-ignore no-explicit-any
export async function loadStudioLimits(db: any): Promise<StudioLimits> {
  const { data } = await db
    .from("studio_settings")
    .select("max_bookings_per_week, no_show_threshold")
    .eq("id", 1)
    .maybeSingle();
  return {
    max_bookings_per_week: data?.max_bookings_per_week ?? DEFAULT_LIMITS.max_bookings_per_week,
    no_show_threshold: data?.no_show_threshold ?? DEFAULT_LIMITS.no_show_threshold,
  };
}

export function isBookingBlocked(booking_blocked_until: string | null): boolean {
  if (!booking_blocked_until) return false;
  return new Date(booking_blocked_until).getTime() > Date.now();
}

// deno-lint-ignore no-explicit-any
export async function countStudentReservations(db: any, studentId: string): Promise<number> {
  const { count } = await db
    .from("reservations")
    .select("key", { count: "exact", head: true })
    .eq("student_id", studentId);
  return count ?? 0;
}

// deno-lint-ignore no-explicit-any
export async function incrementNoShowCount(
  db: any,
  studentId: string,
  limits: StudioLimits,
): Promise<number> {
  const { data: stu } = await db
    .from("students")
    .select("no_show_count")
    .eq("id", studentId)
    .maybeSingle();
  const newCount = (stu?.no_show_count ?? 0) + 1;
  const update: Record<string, unknown> = { no_show_count: newCount };
  if (newCount >= limits.no_show_threshold) {
    update.booking_blocked_until = "2099-01-01T00:00:00.000Z";
  }
  await db.from("students").update(update).eq("id", studentId);
  return newCount;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function csvEscape(value: string): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function parseLimitsPayload(
  maxBookings: unknown,
  noShowThreshold: unknown,
): { ok: true; limits: StudioLimits } | { ok: false; error: string } {
  const max_bookings_per_week = parseInt(String(maxBookings ?? ""), 10);
  const no_show_threshold = parseInt(String(noShowThreshold ?? ""), 10);
  if (Number.isNaN(max_bookings_per_week) || max_bookings_per_week < 1 || max_bookings_per_week > 14) {
    return { ok: false, error: "max bookings per week must be 1–14" };
  }
  if (Number.isNaN(no_show_threshold) || no_show_threshold < 1 || no_show_threshold > 20) {
    return { ok: false, error: "no-show threshold must be 1–20" };
  }
  return { ok: true, limits: { max_bookings_per_week, no_show_threshold } };
}
