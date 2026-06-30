export const EMAIL_TEMPLATE_KEYS = [
  "waitlist_promotion",
  "booking_confirmation",
  "reminder",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export interface EmailTemplate {
  key: EmailTemplateKey;
  subject: string;
  body_html: string;
  updated_at?: string;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

const DEFAULT_TEMPLATES: Record<EmailTemplateKey, Omit<EmailTemplate, "updated_at">> = {
  waitlist_promotion: {
    key: "waitlist_promotion",
    subject: "a spot opened up",
    body_html: `<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>hi {{student_first_name}},</p>
    <p>a spot opened up for <strong>{{day}}, {{slot_label}}</strong> at
    <strong>{{resource_label}}</strong> ({{category_label}}) — and since you were next on the
    waitlist, the spot is now reserved for you.</p>
    <p>see you at the studio.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma's studio</p>
  </div>`,
  },
  booking_confirmation: {
    key: "booking_confirmation",
    subject: "booked: {{resource_label}} — {{day}} {{slot_short_label}}",
    body_html: `<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>hi {{student_first_name}},</p>
    <p>you're booked for:</p>
    <p><strong>{{day}}</strong><br>{{slot_label}}<br>{{resource_label}} ({{category_label}})</p>
    <p>see you at the studio.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma's studio</p>
  </div>`,
  },
  reminder: {
    key: "reminder",
    subject: "reminder: {{resource_label}} — {{day}} {{slot_short_label}}",
    body_html: `<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>hi {{student_first_name}},</p>
    <p>friendly reminder — you have studio time tomorrow:</p>
    <p><strong>{{day}}</strong><br>{{slot_label}}<br>{{resource_label}} ({{category_label}})</p>
    <p>see you at the studio.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma's studio</p>
  </div>`,
  },
};

// deno-lint-ignore no-explicit-any
export async function loadEmailTemplate(
  db: any,
  key: EmailTemplateKey,
): Promise<EmailTemplate> {
  const { data } = await db
    .from("email_templates")
    .select("key, subject, body_html, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (data) return data as EmailTemplate;
  return { ...DEFAULT_TEMPLATES[key] };
}

// deno-lint-ignore no-explicit-any
export async function loadAllEmailTemplates(db: any): Promise<EmailTemplate[]> {
  const { data } = await db
    .from("email_templates")
    .select("key, subject, body_html, updated_at")
    .order("key", { ascending: true });
  const byKey = new Map<string, EmailTemplate>();
  for (const row of data || []) byKey.set(row.key, row as EmailTemplate);
  return EMAIL_TEMPLATE_KEYS.map((key) => byKey.get(key) ?? { ...DEFAULT_TEMPLATES[key] });
}

export function parseEmailTemplatesPayload(
  incoming: unknown,
): { ok: true; templates: EmailTemplate[] } | { ok: false; error: string } {
  if (!Array.isArray(incoming)) return { ok: false, error: "templates must be an array" };
  const templates: EmailTemplate[] = [];
  const seen = new Set<string>();

  for (const row of incoming) {
    const key = String((row as { key?: string })?.key || "");
    if (!EMAIL_TEMPLATE_KEYS.includes(key as EmailTemplateKey)) {
      return { ok: false, error: `unknown template key: ${key}` };
    }
    if (seen.has(key)) return { ok: false, error: `duplicate template key: ${key}` };
    seen.add(key);

    const subject = String((row as { subject?: string })?.subject || "").trim();
    const body_html = String((row as { body_html?: string })?.body_html || "").trim();
    if (!subject || subject.length > 200) {
      return { ok: false, error: `invalid subject for ${key}` };
    }
    if (!body_html || body_html.length > 10000) {
      return { ok: false, error: `invalid body for ${key}` };
    }
    templates.push({ key: key as EmailTemplateKey, subject, body_html });
  }

  if (templates.length !== EMAIL_TEMPLATE_KEYS.length) {
    return { ok: false, error: "all templates required" };
  }
  return { ok: true, templates };
}

export function firstName(fullName: string): string {
  return (fullName || "there").split(" ")[0];
}
