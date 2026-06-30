# Phase 6: Communications

## Status: Pending

## Overview

Editable email templates for waitlist, confirmation, and reminders; broadcast email to full roster; optional Twilio SMS for opted-in students with phone numbers.

## Prerequisites

- Phase 4b complete: Resend integration and email helpers
- Phase 5b recommended: roster export patterns

## Planned Changes

- [ ] Add `supabase/migrations/email-templates.sql` (`email_templates` key/subject/body rows)
- [ ] Seed default templates matching current hardcoded email bodies
- [ ] Extend `_shared/email.ts`: load template by key, substitute `{{student_name}}`, `{{resource_label}}`, etc.
- [ ] Extend `admin-action`: `getEmailTemplates`, `saveEmailTemplates`, `broadcastEmail`
- [ ] Rate-limit broadcast (e.g. max 1/minute, batch sends with delay)
- [ ] Instructor Settings: template editor per type; broadcast compose panel
- [ ] Optional SMS: add `students.phone`, `students.sms_opt_in`; `_shared/sms.ts` (Twilio); `TWILIO_*` secrets
- [ ] Optional: SMS on waitlist promotion for opted-in only

## Target Implementation Shape

**email_templates**

```sql
create table email_templates (
  key text primary key,  -- waitlist_promotion, booking_confirmation, reminder, broadcast
  subject text not null,
  body_html text not null,
  updated_at timestamptz default now()
);
```

**Template render**

```typescript
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
```

**broadcastEmail**

```typescript
// { token, subject, body }
// Load all students with email; send via Resend; log failures to audit_log
// Do not fail entire batch on single bounce
```

## Files Touched

- `supabase/migrations/email-templates.sql` (new)
- `supabase/migrations/sms-optional.sql` (new, if SMS)
- `supabase/functions/_shared/email.ts`
- `supabase/functions/_shared/sms.ts` (new, optional)
- `supabase/functions/admin-action/index.ts`
- `index.html`

## Verification Checklist

- [ ] Edit waitlist template in Settings → next promotion uses new subject/body
- [ ] Broadcast to test roster → all emails received; audit log entry created
- [ ] Invalid template variable leaves placeholder or empty (document behavior)
- [ ] SMS: opted-in student with phone receives test SMS; non-opt-in does not
- [ ] Broadcast rate limit prevents accidental double-send spam

## Implementation Notes

<!-- Filled during implementation -->

## Navigation

← [05c-audit-pin.md](./05c-audit-pin.md) · ↑ [00-index.md](./00-index.md) · → [07-polish-security.md](./07-polish-security.md)
