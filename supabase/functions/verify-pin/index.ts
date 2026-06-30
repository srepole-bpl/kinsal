// verify-pin
// Compares the submitted PIN hash to stored hash (DB or PIN_HASH env fallback).
// On success, mints a short-lived signed instructor token. Includes a
// database-backed lockout so the PIN can't be brute-forced by hammering this
// endpoint directly (the browser's own lockout is irrelevant to an attacker).
import { json, preflight } from "../_shared/cors.ts";
import { createInstructorToken } from "../_shared/jwt.ts";
import { serviceClient } from "../_shared/db.ts";
import { getStoredPinHash, verifyPinHash } from "../_shared/pin.ts";

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const TOKEN_TTL_S = 20 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ success: false, error: "method not allowed" }, 405);

  let body: { pinHash?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "bad request" }, 400);
  }
  const pinHash = String(body?.pinHash || "");

  const db = serviceClient();
  const expected = await getStoredPinHash(db);
  if (!expected) return json({ success: false, error: "server not configured" }, 500);

  const now = Date.now();

  const { data: th } = await db.from("auth_throttle").select("*").eq("id", 1).single();

  if (th?.locked_until && new Date(th.locked_until).getTime() > now) {
    return json(
      { success: false, error: "locked", lockedUntil: new Date(th.locked_until).getTime() },
      429,
    );
  }

  const ok = verifyPinHash(pinHash, expected);

  if (ok) {
    await db.from("auth_throttle").update({
      fail_count: 0,
      window_start: null,
      locked_until: null,
    }).eq("id", 1);

    const token = await createInstructorToken(TOKEN_TTL_S);
    return json({ success: true, token, expires: now + TOKEN_TTL_S * 1000 });
  }

  const wStart = th?.window_start ? new Date(th.window_start).getTime() : 0;
  let count: number;
  let windowStart: string | null;

  if (!wStart || now - wStart > WINDOW_MS) {
    count = 1;
    windowStart = new Date(now).toISOString();
  } else {
    count = (th?.fail_count || 0) + 1;
    windowStart = th?.window_start ?? new Date(now).toISOString();
  }

  let locked_until: string | null = null;
  if (count >= MAX_FAILS) {
    locked_until = new Date(now + LOCKOUT_MS).toISOString();
    count = 0;
    windowStart = null;
  }

  await db.from("auth_throttle").upsert({
    id: 1,
    fail_count: count,
    window_start: windowStart,
    locked_until,
  });

  return json({ success: false, error: "incorrect pin" }, 401);
});
