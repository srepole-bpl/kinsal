// Sends the "a wheel opened up" email via Resend. Best-effort: if the key is
// missing or Resend errors, we log and move on rather than failing the booking
// flow. RESEND_API_KEY lives only in server env.
export async function sendWaitlistEmail(
  to: string,
  studentName: string,
  slotKey: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;

  const [day, slotId, wheel] = slotKey.split("|");
  const slotLabel = slotId === "am"
    ? "morning (9:00am – 1:00pm)"
    : "evening (4:00pm – 8:00pm)";
  const first = (studentName || "there").split(" ")[0];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Salma's Studio <ceramics@salmas.studio>",
        to,
        subject: "a wheel just opened up",
        html:
          `<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
            <p>hi ${first},</p>
            <p>a wheel opened up for <strong>${day}, ${slotLabel}</strong> on the
            <strong>${wheel}</strong> wheel — and since you were next on the
            waitlist, the spot is now reserved for you.</p>
            <p>see you at the studio.</p>
            <p style="color:#9c8e7c;font-size:13px">— salma's studio</p>
          </div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
