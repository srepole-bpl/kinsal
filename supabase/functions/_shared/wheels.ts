export const MAX_WHEELS = 12;

export function isValidWheelLabel(label: string): boolean {
  return /^[a-zA-Z0-9\s'\-\.]{2,40}$/.test(label);
}

export function sanitizeWheelLabel(s: string): string {
  return String(s).replace(/[<>"'&\/\\;|]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function newWheelId(): string {
  return "wheel" + Date.now();
}

// deno-lint-ignore no-explicit-any
export async function loadWheelIds(db: any): Promise<Set<string>> {
  const { data } = await db.from("wheels").select("id");
  return new Set((data || []).map((w: { id: string }) => w.id));
}

// deno-lint-ignore no-explicit-any
export async function wheelLabelForId(db: any, wheelId: string): Promise<string> {
  const { data } = await db
    .from("wheels")
    .select("label")
    .eq("id", wheelId)
    .maybeSingle();
  return data?.label ?? wheelId;
}
