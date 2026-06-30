-- Phase 6: editable email templates + broadcast rate limit
-- Run: supabase db query --linked --file supabase/migrations/email-templates.sql

create table if not exists email_templates (
  key text primary key check (key in (
    'waitlist_promotion',
    'booking_confirmation',
    'reminder'
  )),
  subject text not null,
  body_html text not null,
  updated_at timestamptz not null default now()
);

alter table email_templates enable row level security;
revoke all on email_templates from anon, authenticated;

alter table studio_settings
  add column if not exists last_broadcast_at timestamptz;

insert into email_templates (key, subject, body_html) values
(
  'waitlist_promotion',
  'a spot opened up',
  '<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>hi {{student_first_name}},</p>
    <p>a spot opened up for <strong>{{day}}, {{slot_label}}</strong> at
    <strong>{{resource_label}}</strong> ({{category_label}}) — and since you were next on the
    waitlist, the spot is now reserved for you.</p>
    <p>see you at the studio.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma''s studio</p>
  </div>'
),
(
  'booking_confirmation',
  'booked: {{resource_label}} — {{day}} {{slot_short_label}}',
  '<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>hi {{student_first_name}},</p>
    <p>you''re booked for:</p>
    <p><strong>{{day}}</strong><br>{{slot_label}}<br>{{resource_label}} ({{category_label}})</p>
    <p>see you at the studio.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma''s studio</p>
  </div>'
),
(
  'reminder',
  'reminder: {{resource_label}} — {{day}} {{slot_short_label}}',
  '<div style="font-family:Georgia,serif;color:#2c2416;line-height:1.6">
    <p>hi {{student_first_name}},</p>
    <p>friendly reminder — you have studio time tomorrow:</p>
    <p><strong>{{day}}</strong><br>{{slot_label}}<br>{{resource_label}} ({{category_label}})</p>
    <p>see you at the studio.</p>
    <p style="color:#9c8e7c;font-size:13px">— salma''s studio</p>
  </div>'
)
on conflict (key) do nothing;
