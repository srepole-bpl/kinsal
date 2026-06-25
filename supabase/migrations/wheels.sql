-- Wheels table: stable ids for reservation keys, editable labels for display.
create table if not exists wheels (
  id         text primary key,
  label      text not null,
  sort_order int  not null default 0
);

insert into wheels (id, label, sort_order) values
  ('shimpo',   'Shimpo',   0),
  ('pacifica', 'Pacifica', 1),
  ('bhr',      'BHR',      2)
on conflict (id) do nothing;

-- One-time migration: reservation keys used display names; switch to stable ids.
update reservations set key = regexp_replace(key, '\|Shimpo$',   '|shimpo');
update reservations set key = regexp_replace(key, '\|Pacifica$', '|pacifica');
update reservations set key = regexp_replace(key, '\|BHR$',      '|bhr');

update waitlists set key = regexp_replace(key, '\|Shimpo$',   '|shimpo');
update waitlists set key = regexp_replace(key, '\|Pacifica$', '|pacifica');
update waitlists set key = regexp_replace(key, '\|BHR$',      '|bhr');

update no_shows set key = regexp_replace(key, '\|Shimpo$',   '|shimpo');
update no_shows set key = regexp_replace(key, '\|Pacifica$', '|pacifica');
update no_shows set key = regexp_replace(key, '\|BHR$',      '|bhr');

alter table wheels enable row level security;

drop policy if exists "anon read wheels" on wheels;
create policy "anon read wheels"
  on wheels for select to anon, authenticated using (true);

-- Writes only via service role in admin-action (no anon/authenticated policies).
