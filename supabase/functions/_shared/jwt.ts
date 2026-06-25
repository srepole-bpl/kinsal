// Signed instructor tokens. A token is a JWT signed with JWT_SECRET (a long
// random string known only to the server). The browser receives the token but
// CANNOT forge one, because it never sees JWT_SECRET. admin-action verifies the
// signature on every privileged call.
import {
  create,
  getNumericDate,
  verify,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) throw new Error("JWT_SECRET is not set");
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createInstructorToken(ttlSeconds = 20 * 60): Promise<string> {
  return await create(
    { alg: "HS256", typ: "JWT" },
    { role: "instructor", exp: getNumericDate(ttlSeconds) },
    await hmacKey(),
  );
}

export async function verifyInstructorToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;
  try {
    const payload = await verify(token, await hmacKey());
    return payload?.role === "instructor";
  } catch {
    return false;
  }
}
