export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function normalizePinHash(hash: string): string {
  return String(hash || "").trim().toLowerCase();
}

// deno-lint-ignore no-explicit-any
export async function getStoredPinHash(db: any): Promise<string> {
  const { data } = await db
    .from("instructor_secrets")
    .select("pin_hash")
    .eq("id", 1)
    .maybeSingle();
  if (data?.pin_hash) return normalizePinHash(data.pin_hash);
  return normalizePinHash(Deno.env.get("PIN_HASH") || "");
}

// deno-lint-ignore no-explicit-any
export async function setStoredPinHash(db: any, pinHash: string): Promise<void> {
  const normalized = normalizePinHash(pinHash);
  const { error } = await db.from("instructor_secrets").upsert({
    id: 1,
    pin_hash: normalized,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function verifyPinHash(pinHash: string, expected: string): boolean {
  const a = normalizePinHash(pinHash);
  const b = normalizePinHash(expected);
  return a.length > 0 && b.length > 0 && timingSafeEqual(a, b);
}

export function isValidPinHash(pinHash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(pinHash);
}
