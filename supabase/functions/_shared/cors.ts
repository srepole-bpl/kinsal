// Shared CORS + JSON response helpers.
//
// SECURITY NOTE: the app is served from GitHub Pages and embedded in a Pixiset
// iframe. Because the booking UI itself lives on the GitHub Pages origin, the
// browser's fetch() calls to these functions carry THAT origin in the Origin
// header — NOT the Pixiset parent. So the CORS allowlist only needs the Pages
// origin (plus localhost for local testing). The Pixiset parent origin matters
// only for postMessage targeting, never for CORS here.
const ALLOWED_ORIGINS = [
  "https://srepole-bpl.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

export function isAllowedOrigin(origin: string): boolean {
  return origin.length > 0 && ALLOWED_ORIGINS.includes(origin);
}

function headersFor(origin: string): Record<string, string> {
  // Reflect the caller's origin only when it is on the allowlist; otherwise
  // fall back to the canonical Pages origin so a foreign site never receives a
  // permissive Access-Control-Allow-Origin echoing its own origin.
  const allow = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function json(body: unknown, status = 200, origin = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headersFor(origin), "Content-Type": "application/json" },
  });
}

export function preflight(origin = ""): Response {
  return new Response("ok", { headers: headersFor(origin) });
}

// For browser-facing functions: if a request carries an Origin header that is
// NOT on the allowlist, reject it. Requests with no Origin header (server-to-
// server callers such as pg_cron, which are additionally secret-gated) pass
// through untouched.
export function rejectForeignOrigin(req: Request): Response | null {
  const origin = req.headers.get("Origin");
  if (origin && !isAllowedOrigin(origin)) {
    return json({ success: false, error: "forbidden origin" }, 403, origin);
  }
  return null;
}
