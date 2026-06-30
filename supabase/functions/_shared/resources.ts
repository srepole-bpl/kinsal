import {
  isWheelCategory,
  type Resource,
  type ResourceCategory,
  type Room,
} from "./types/domain.ts";

export const MAX_ROOMS = 10;
export const MAX_RESOURCES = 20;

export function isValidResourceLabel(label: string): boolean {
  return /^[a-zA-Z0-9\s'\-\.]{2,40}$/.test(label);
}

export function isValidRoomLabel(label: string): boolean {
  return /^[a-zA-Z0-9\s'\-\.]{2,40}$/.test(label);
}

export function sanitizeResourceLabel(s: string): string {
  return String(s).replace(/[<>"'&\/\\;|]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function sanitizeRoomLabel(s: string): string {
  return sanitizeResourceLabel(s);
}

export function newResourceId(): string {
  return "resource" + Date.now();
}

export function newRoomId(): string {
  return "room" + Date.now();
}

function parseCategory(c: string): ResourceCategory | null {
  if (c === "wheel" || c === "hand_build_table" || c === "clay_prep_table" || c === "glaze_table") {
    return c;
  }
  return null;
}

export function validateResourceCapacity(category: ResourceCategory, capacity: number): boolean {
  if (isWheelCategory(category)) return capacity === 1;
  return capacity >= 2 && capacity <= 5;
}

// deno-lint-ignore no-explicit-any
export async function loadResourceIds(db: any): Promise<Set<string>> {
  const { data } = await db.from("resources").select("id");
  if (data && data.length > 0) {
    return new Set(data.map((r: { id: string }) => r.id));
  }
  // Fallback during migration before resources table is populated
  const { data: wheels } = await db.from("wheels").select("id");
  return new Set((wheels || []).map((w: { id: string }) => w.id));
}

// deno-lint-ignore no-explicit-any
export async function getResource(db: any, resourceId: string): Promise<Resource | null> {
  const { data } = await db
    .from("resources")
    .select("id, room_id, label, category, capacity, sort_order")
    .eq("id", resourceId)
    .maybeSingle();
  if (data) return data as Resource;

  const { data: wheel } = await db
    .from("wheels")
    .select("id, label, sort_order")
    .eq("id", resourceId)
    .maybeSingle();
  if (!wheel) return null;
  return {
    id: wheel.id,
    room_id: "main-studio",
    label: wheel.label,
    category: "wheel",
    capacity: 1,
    sort_order: wheel.sort_order ?? 0,
  };
}

// deno-lint-ignore no-explicit-any
export async function resourceLabelForId(db: any, resourceId: string): Promise<string> {
  const r = await getResource(db, resourceId);
  return r?.label ?? resourceId;
}

// deno-lint-ignore no-explicit-any
export async function maxConcurrentBookingsForResource(db: any, resourceId: string): Promise<number> {
  const pattern = `%|${resourceId}`;
  const { data: keys } = await db.from("reservations").select("key").like("key", pattern);
  if (!keys || keys.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const row of keys as { key: string }[]) {
    counts.set(row.key, (counts.get(row.key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

// deno-lint-ignore no-explicit-any
export async function resourceHasBookings(db: any, resourceId: string): Promise<boolean> {
  const pattern = `%|${resourceId}`;
  const { data: res } = await db.from("reservations").select("key").like("key", pattern).limit(1);
  if (res && res.length > 0) return true;
  const { data: wl } = await db.from("waitlists").select("key").like("key", pattern).limit(1);
  if (wl && wl.length > 0) return true;
  const { data: ns } = await db.from("no_shows").select("key").like("key", pattern).limit(1);
  return !!(ns && ns.length > 0);
}

// deno-lint-ignore no-explicit-any
export async function nextFreeSpot(db: any, slotKey: string, capacity: number): Promise<number | null> {
  const { data: rows } = await db
    .from("reservations")
    .select("spot_index")
    .eq("key", slotKey);
  const used = new Set((rows || []).map((r: { spot_index: number }) => r.spot_index));
  for (let i = 1; i <= capacity; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

export interface ParsedResource {
  id: string;
  room_id: string;
  label: string;
  category: ResourceCategory;
  capacity: number;
  sort_order: number;
}

export function parseResourcePayload(
  incoming: unknown,
): { ok: true; resources: ParsedResource[] } | { ok: false; error: string } {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { ok: false, error: "at least one resource is required" };
  }
  if (incoming.length > MAX_RESOURCES) {
    return { ok: false, error: `maximum ${MAX_RESOURCES} resources` };
  }

  const normalized: ParsedResource[] = [];
  const labelsSeen = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const raw = incoming[i] as Record<string, unknown>;
    const label = sanitizeResourceLabel(String(raw?.label || ""));
    if (!isValidResourceLabel(label)) {
      return { ok: false, error: `invalid resource name: ${label || "(empty)"}` };
    }
    const labelKey = label.toLowerCase();
    if (labelsSeen.has(labelKey)) {
      return { ok: false, error: "resource names must be unique" };
    }
    labelsSeen.add(labelKey);

    const category = parseCategory(String(raw?.category || "wheel"));
    if (!category) return { ok: false, error: "invalid resource category" };

    let capacity = parseInt(String(raw?.capacity ?? (isWheelCategory(category) ? 1 : 4)), 10);
    if (isWheelCategory(category)) capacity = 1;
    if (!validateResourceCapacity(category, capacity)) {
      return { ok: false, error: "wheels must have 1 seat; tables must have 2–5 seats" };
    }

    const room_id = String(raw?.room_id || "").trim();
    if (!room_id) return { ok: false, error: "each resource must belong to a room" };

    let id = String(raw?.id || "").trim();
    if (!id) id = newResourceId();

    normalized.push({ id, room_id, label, category, capacity, sort_order: i });
  }

  return { ok: true, resources: normalized };
}

export function parseRoomPayload(
  incoming: unknown,
): { ok: true; rooms: Room[] } | { ok: false; error: string } {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { ok: false, error: "at least one room is required" };
  }
  if (incoming.length > MAX_ROOMS) {
    return { ok: false, error: `maximum ${MAX_ROOMS} rooms` };
  }

  const normalized: Room[] = [];
  const labelsSeen = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const raw = incoming[i] as Record<string, unknown>;
    const label = sanitizeRoomLabel(String(raw?.label || ""));
    if (!isValidRoomLabel(label)) {
      return { ok: false, error: `invalid room name: ${label || "(empty)"}` };
    }
    const labelKey = label.toLowerCase();
    if (labelsSeen.has(labelKey)) {
      return { ok: false, error: "room names must be unique" };
    }
    labelsSeen.add(labelKey);

    let id = String(raw?.id || "").trim();
    if (!id) id = newRoomId();

    normalized.push({ id, label, sort_order: i });
  }

  return { ok: true, rooms: normalized };
}
