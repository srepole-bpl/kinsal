import { CATEGORY_LABELS, type ScheduleSlot, type StudioSchedule } from "./types/domain.ts";
import { getResource, resourceLabelForId } from "./resources.ts";

function formatHour(h: number): string {
  if (h === 0 || h === 24) return "12:00 am";
  if (h === 12) return "12:00 pm";
  return h < 12 ? `${h}:00 am` : `${h - 12}:00 pm`;
}

export function slotTimeLabel(schedule: StudioSchedule, slotId: string): string {
  const slot = schedule.slots.find((s) => s.id === slotId);
  if (!slot) return slotId;
  return `${slot.label} (${formatHour(slot.start_hour)} – ${formatHour(slot.end_hour)})`;
}

interface BookingParts {
  day: string;
  slotId: string;
  resourceId: string;
}

function bookingEmailHtml(
  first: string,
  day: string,
  slotLabel: string,
  resourceLabel: string,
  categoryLabel: string,
  intro: string,
): string {
  return `<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>hi ${first},</p>
    <p>${intro}</p>
    <p><strong>${day}</strong><br>${slotLabel}<br>${resourceLabel} (${categoryLabel})</p>
    <p>see you at the studio.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma's studio</p>
  </div>`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
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
        subject,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// deno-lint-ignore no-explicit-any
export async function sendWaitlistEmail(
  db: any,
  to: string,
  studentName: string,
  slotKey: string,
): Promise<boolean> {
  const [day, slotId, resourceId] = slotKey.split("|");
  const resource = await getResource(db, resourceId);
  const resourceLabel = resource?.label ?? await resourceLabelForId(db, resourceId);
  const categoryLabel = resource ? CATEGORY_LABELS[resource.category] : "wheel";
  const isWheel = resource?.category === "wheel";
  const first = (studentName || "there").split(" ")[0];
  const slotLabel = slotId === "am"
    ? "morning (9:00am – 1:00pm)"
    : slotId === "pm"
    ? "evening (4:00pm – 8:00pm)"
    : slotId;

  return sendEmail(
    to,
    isWheel ? "a wheel opened up" : "a spot opened up",
    `<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
      <p>hi ${first},</p>
      <p>a spot opened up for <strong>${day}, ${slotLabel}</strong> at
      <strong>${resourceLabel}</strong> (${categoryLabel}) — and since you were next on the
      waitlist, the spot is now reserved for you.</p>
      <p>see you at the studio.</p>
      <p style="color:#9c8e7c;font-size:13px">— salma's studio</p>
    </div>`,
  );
}

// deno-lint-ignore no-explicit-any
export async function sendBookingConfirmation(
  db: any,
  schedule: StudioSchedule,
  studentName: string,
  studentEmail: string,
  booking: BookingParts,
): Promise<boolean> {
  const resource = await getResource(db, booking.resourceId);
  const resourceLabel = resource?.label ?? await resourceLabelForId(db, booking.resourceId);
  const categoryLabel = resource ? CATEGORY_LABELS[resource.category] : "wheel";
  const slotLabel = slotTimeLabel(schedule, booking.slotId);
  const first = (studentName || "there").split(" ")[0];
  const subject = `booked: ${resourceLabel} — ${booking.day} ${schedule.slots.find((s) => s.id === booking.slotId)?.label ?? booking.slotId}`;

  return sendEmail(
    studentEmail,
    subject,
    bookingEmailHtml(
      first,
      booking.day,
      slotLabel,
      resourceLabel,
      categoryLabel,
      "you're booked for:",
    ),
  );
}

// deno-lint-ignore no-explicit-any
export async function sendReminderEmail(
  db: any,
  schedule: StudioSchedule,
  studentName: string,
  studentEmail: string,
  booking: BookingParts,
): Promise<boolean> {
  const resource = await getResource(db, booking.resourceId);
  const resourceLabel = resource?.label ?? await resourceLabelForId(db, booking.resourceId);
  const categoryLabel = resource ? CATEGORY_LABELS[resource.category] : "wheel";
  const slotLabel = slotTimeLabel(schedule, booking.slotId);
  const first = (studentName || "there").split(" ")[0];
  const slot = schedule.slots.find((s) => s.id === booking.slotId);
  const subject = `reminder: ${resourceLabel} — ${booking.day} ${slot?.label ?? booking.slotId}`;

  return sendEmail(
    studentEmail,
    subject,
    bookingEmailHtml(
      first,
      booking.day,
      slotLabel,
      resourceLabel,
      categoryLabel,
      "friendly reminder — you have studio time tomorrow:",
    ),
  );
}

export function parseBookingKey(key: string): BookingParts | null {
  const [day, slotId, resourceId] = key.split("|");
  if (!day || !slotId || !resourceId) return null;
  return { day, slotId, resourceId };
}

export function tomorrowWeekday(timezone: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).formatToParts(tomorrow);
  return parts.find((p) => p.type === "weekday")?.value ?? "";
}

export type { BookingParts };
