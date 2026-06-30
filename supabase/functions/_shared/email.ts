import { CATEGORY_LABELS, type StudioSchedule } from "./types/domain.ts";
import { getResource, resourceLabelForId } from "./resources.ts";
import {
  firstName,
  loadEmailTemplate,
  renderTemplate,
  type EmailTemplateKey,
} from "./templates.ts";

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

export async function sendEmail(
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

async function bookingVars(
  // deno-lint-ignore no-explicit-any
  db: any,
  schedule: StudioSchedule,
  studentName: string,
  booking: BookingParts,
): Promise<Record<string, string>> {
  const resource = await getResource(db, booking.resourceId);
  const resourceLabel = resource?.label ?? await resourceLabelForId(db, booking.resourceId);
  const categoryLabel = resource ? CATEGORY_LABELS[resource.category] : "wheel";
  const slot = schedule.slots.find((s) => s.id === booking.slotId);
  const slotLabel = slotTimeLabel(schedule, booking.slotId);
  return {
    student_name: studentName || "there",
    student_first_name: firstName(studentName),
    day: booking.day,
    slot_label: slotLabel,
    slot_short_label: slot?.label ?? booking.slotId,
    resource_label: resourceLabel,
    category_label: categoryLabel,
  };
}

async function sendTemplatedEmail(
  // deno-lint-ignore no-explicit-any
  db: any,
  templateKey: EmailTemplateKey,
  to: string,
  vars: Record<string, string>,
  subjectOverride?: string,
): Promise<boolean> {
  const template = await loadEmailTemplate(db, templateKey);
  const subject = renderTemplate(subjectOverride ?? template.subject, vars);
  const html = renderTemplate(template.body_html, vars);
  return sendEmail(to, subject, html);
}

function legacySlotLabel(slotId: string): string {
  return slotId === "am"
    ? "morning (9:00am – 1:00pm)"
    : slotId === "pm"
    ? "evening (4:00pm – 8:00pm)"
    : slotId;
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
  const vars = {
    student_name: studentName || "there",
    student_first_name: firstName(studentName),
    day,
    slot_label: legacySlotLabel(slotId),
    slot_short_label: slotId,
    resource_label: resourceLabel,
    category_label: categoryLabel,
  };
  const subjectOverride = isWheel ? "a wheel opened up" : undefined;
  return sendTemplatedEmail(db, "waitlist_promotion", to, vars, subjectOverride);
}

// deno-lint-ignore no-explicit-any
export async function sendBookingConfirmation(
  db: any,
  schedule: StudioSchedule,
  studentName: string,
  studentEmail: string,
  booking: BookingParts,
): Promise<boolean> {
  const vars = await bookingVars(db, schedule, studentName, booking);
  return sendTemplatedEmail(db, "booking_confirmation", studentEmail, vars);
}

// deno-lint-ignore no-explicit-any
export async function sendReminderEmail(
  db: any,
  schedule: StudioSchedule,
  studentName: string,
  studentEmail: string,
  booking: BookingParts,
): Promise<boolean> {
  const vars = await bookingVars(db, schedule, studentName, booking);
  return sendTemplatedEmail(db, "reminder", studentEmail, vars);
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

const BROADCAST_SEND_DELAY_MS = 200;

export async function sendBroadcastEmails(
  recipients: { name: string; email: string }[],
  subjectTemplate: string,
  bodyTemplate: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const stu of recipients) {
    const vars = {
      student_name: stu.name || "there",
      student_first_name: firstName(stu.name),
    };
    const ok = await sendEmail(
      stu.email,
      renderTemplate(subjectTemplate, vars),
      renderTemplate(bodyTemplate, vars),
    );
    if (ok) sent++;
    else failed++;
    if (BROADCAST_SEND_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, BROADCAST_SEND_DELAY_MS));
    }
  }

  return { sent, failed };
}

export type { BookingParts };
