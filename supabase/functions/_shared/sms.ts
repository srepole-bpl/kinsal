export async function sendSms(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !from) return false;

  const normalized = String(to || "").replace(/\D/g, "");
  if (normalized.length < 10) return false;

  const toE164 = normalized.startsWith("1") && normalized.length === 11
    ? `+${normalized}`
    : normalized.length === 10
    ? `+1${normalized}`
    : `+${normalized}`;

  const text = String(body || "").trim().slice(0, 320);
  if (!text) return false;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: toE164, From: from, Body: text }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function waitlistSmsBody(
  studentFirst: string,
  day: string,
  slotLabel: string,
  resourceLabel: string,
): string {
  return `Hi ${studentFirst}, a spot opened for ${day} ${slotLabel} at ${resourceLabel}. You're booked — see you at the studio! — Salma's Studio`;
}
