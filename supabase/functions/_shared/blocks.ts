const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface SlotBlock {
  id: number;
  key_pattern: string;
  reason: string | null;
  blocked_until: string | null;
}

export interface ClosedDay {
  date: string;
  reason: string | null;
}

export function nextOccurrenceDate(weekday: string, timezone: string): string {
  const target = WEEK.indexOf(weekday);
  if (target < 0) return "";
  const now = new Date();
  for (let add = 0; add < 8; add++) {
    const probe = new Date(now.getTime() + add * 86400000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(probe);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    if (WEEK.indexOf(wd) !== target) continue;
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}-${m}-${d}`;
  }
  return "";
}

export function keyMatchesPattern(key: string, pattern: string): boolean {
  return key.startsWith(pattern);
}

function blockActive(block: SlotBlock, now = Date.now()): boolean {
  if (!block.blocked_until) return true;
  return new Date(block.blocked_until).getTime() >= now;
}

// deno-lint-ignore no-explicit-any
export async function loadSlotBlocks(db: any): Promise<SlotBlock[]> {
  const { data } = await db.from("slot_blocks").select("*").order("id");
  return (data || []) as SlotBlock[];
}

// deno-lint-ignore no-explicit-any
export async function loadClosedDays(db: any): Promise<ClosedDay[]> {
  const { data } = await db.from("closed_days").select("*").order("date");
  return (data || []) as ClosedDay[];
}

// deno-lint-ignore no-explicit-any
export async function isClosedDate(db: any, dateStr: string): Promise<boolean> {
  if (!dateStr) return false;
  const { data } = await db.from("closed_days").select("date").eq("date", dateStr).maybeSingle();
  return !!data;
}

// deno-lint-ignore no-explicit-any
export async function isClosedForWeekday(
  db: any,
  weekday: string,
  timezone: string,
): Promise<boolean> {
  const date = nextOccurrenceDate(weekday, timezone);
  return isClosedDate(db, date);
}

// deno-lint-ignore no-explicit-any
export async function getActiveBlock(
  db: any,
  key: string,
  blocks?: SlotBlock[],
): Promise<SlotBlock | null> {
  const list = blocks ?? await loadSlotBlocks(db);
  const now = Date.now();
  for (const block of list) {
    if (!blockActive(block, now)) continue;
    if (keyMatchesPattern(key, block.key_pattern)) return block;
  }
  return null;
}

export function parseBlockPayload(
  incoming: unknown,
): { ok: true; blocks: Omit<SlotBlock, "id">[] } | { ok: false; error: string } {
  if (!Array.isArray(incoming)) {
    return { ok: false, error: "blocks must be an array" };
  }
  const blocks: Omit<SlotBlock, "id">[] = [];
  const patternsSeen = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const raw = incoming[i] as Record<string, unknown>;
    const key_pattern = String(raw?.key_pattern || "").trim();
    if (!key_pattern || key_pattern.length > 120) {
      return { ok: false, error: `invalid block pattern at row ${i + 1}` };
    }
    const parts = key_pattern.split("|");
    if (parts.length < 2 || parts.length > 3) {
      return { ok: false, error: "block pattern must be day|slot or day|slot|resource" };
    }
    if (!WEEK.includes(parts[0])) {
      return { ok: false, error: `invalid weekday in block: ${parts[0]}` };
    }
    if (!parts[1]) {
      return { ok: false, error: "block pattern needs a slot id" };
    }
    if (patternsSeen.has(key_pattern)) {
      return { ok: false, error: "duplicate block patterns" };
    }
    patternsSeen.add(key_pattern);

    const reason = raw?.reason != null
      ? String(raw.reason).replace(/[<>"'&]/g, "").trim().slice(0, 200)
      : null;
    let blocked_until: string | null = null;
    if (raw?.blocked_until) {
      const t = new Date(String(raw.blocked_until));
      if (Number.isNaN(t.getTime())) {
        return { ok: false, error: "invalid blocked_until timestamp" };
      }
      blocked_until = t.toISOString();
    }
    blocks.push({ key_pattern, reason, blocked_until });
  }

  return { ok: true, blocks };
}

export function parseClosedDaysPayload(
  incoming: unknown,
): { ok: true; days: ClosedDay[] } | { ok: false; error: string } {
  if (!Array.isArray(incoming)) {
    return { ok: false, error: "closed days must be an array" };
  }
  const days: ClosedDay[] = [];
  const datesSeen = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const raw = incoming[i] as Record<string, unknown>;
    const date = String(raw?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: `invalid date at row ${i + 1}` };
    }
    if (datesSeen.has(date)) {
      return { ok: false, error: "duplicate closed dates" };
    }
    datesSeen.add(date);
    const reason = raw?.reason != null
      ? String(raw.reason).replace(/[<>"'&]/g, "").trim().slice(0, 200)
      : null;
    days.push({ date, reason });
  }

  return { ok: true, days };
}
