-- Cerulean production site: database schema, access rules and storage buckets.
-- Run this whole file once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It is safe to run again; it skips anything that already exists.

-- ─────────────────────────────────────────────────────────────
-- Profiles: one row per person who can sign in.
-- role 'admin' = producer / director (can edit the cast board, the
-- shoot days, anyone's availability, and remove any file).
-- ─────────────────────────────────────────────────────────────
-- approved: people who sign up on the site wait here until an admin approves them.
-- People an admin invites from the Supabase dashboard are approved automatically.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null default '',
  role        text not null default 'member' check (role in ('admin','member')),
  approved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Upgrading from an older copy of this file: add the column and approve everyone already here.
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'approved') then
    alter table public.profiles add column approved boolean not null default false;
    update public.profiles set approved = true;
  end if;
end $$;

-- Runs when someone signs up. Creates their profile and, if they used the
-- sign-up page, puts them on the cast & crew list with the role they picked
-- (or links them to a matching name an admin already added).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nm    text  := btrim(coalesce(meta->>'full_name', ''));
  dept  text  := meta->>'department';
  jb    text  := btrim(coalesce(meta->>'job', ''));
  chars text[];
  match uuid;
begin
  insert into public.profiles (id, full_name, approved)
  values (new.id, nm, new.invited_at is not null)
  on conflict (id) do nothing;

  if dept in ('cast','crew') and char_length(nm) >= 2 then
    begin
      chars := coalesce(array(select jsonb_array_elements_text(
                 case when jsonb_typeof(meta->'characters') = 'array' then meta->'characters' else '[]'::jsonb end)), '{}');
      select id into match from public.people
        where user_id is null and lower(btrim(name)) = lower(nm) limit 1;
      if match is not null then
        update public.people set user_id = new.id where id = match;
      else
        insert into public.people (name, department, characters, job, user_id, created_by)
        values (nm, dept,
                case when dept = 'cast' then chars else '{}' end,
                case when dept = 'crew' then jb else '' end,
                new.id, new.id);
      end if;
    exception when others then
      null;  -- never block a sign-up over the roster; an admin can add them on Manage
    end;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for anyone who signed in before this file was run (they count as approved).
insert into public.profiles (id, full_name, approved)
select id, coalesce(raw_user_meta_data->>'full_name', ''), true from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Approved members (and admins) can see the schedule, availability, files and photos.
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (approved or role = 'admin'));
$$;

-- ─────────────────────────────────────────────────────────────
-- Cast board on the home page (public).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cast_cards (
  id          uuid primary key default gen_random_uuid(),
  actor_name  text not null default '',
  character   text not null,
  blurb       text not null default '',
  photo_path  text,                       -- path inside the 'headshots' bucket
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Shoot days (the call sheet dates).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shoot_days (
  id          text primary key,
  sort_order  int  not null,
  day_label   text not null,
  shoot_date  date not null,
  title       text not null,
  location    text not null,
  address     text not null default '',
  scenes      text not null default '',
  crew_call   text not null default 'TBD',
  cast_call   text not null default 'TBD',
  wrap        text not null default 'TBD',
  characters  text[] not null default '{}',   -- characters in that day's scenes
  confirmed   boolean not null default false
);

-- ─────────────────────────────────────────────────────────────
-- People on the availability tracker (cast and crew).
-- user_id links a row to the person's login once they claim it.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) >= 2),
  department  text not null check (department in ('cast','crew')),
  characters  text[] not null default '{}',
  job         text not null default '',
  notes       text not null default '',
  user_id     uuid unique references auth.users on delete set null,
  created_by  uuid default auth.uid() references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  constraint cast_needs_character check (department <> 'cast' or cardinality(characters) > 0),
  constraint crew_needs_job       check (department <> 'crew' or char_length(btrim(job)) >= 2)
);

-- One answer per person per shoot day. A reason is required unless the answer is 'yes'.
create table if not exists public.availability (
  person_id   uuid not null references public.people on delete cascade,
  day_id      text not null references public.shoot_days on delete cascade,
  status      text not null check (status in ('yes','maybe','no')),
  reason      text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users on delete set null,
  primary key (person_id, day_id),
  constraint reason_required check (status = 'yes' or char_length(btrim(reason)) >= 3)
);

-- ─────────────────────────────────────────────────────────────
-- Files: meeting notes, charts, schedules, scripts, call sheets.
-- The file itself lives in the private 'documents' bucket.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) >= 2),
  category     text not null check (category in ('meeting_notes','chart','schedule','script','call_sheet','other')),
  meeting_date date,
  description  text not null default '',
  file_path    text not null unique,
  file_name    text not null,
  mime_type    text not null default '',
  size_bytes   bigint not null default 0,
  uploaded_by  uuid default auth.uid() references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.cast_cards   enable row level security;
alter table public.shoot_days   enable row level security;
alter table public.people       enable row level security;
alter table public.availability enable row level security;
alter table public.documents    enable row level security;

-- profiles: signed-in people see everyone's name; each person can change only their own name.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_member());
drop policy if exists "profiles update own name" on public.profiles;
create policy "profiles update own name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;   -- nobody can promote themselves

-- cast_cards: anyone can read (home page is public); admins edit.
drop policy if exists "cast read" on public.cast_cards;
create policy "cast read" on public.cast_cards for select to anon, authenticated using (true);
drop policy if exists "cast admin write" on public.cast_cards;
create policy "cast admin write" on public.cast_cards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- shoot_days: signed-in people read; admins edit.
drop policy if exists "days read" on public.shoot_days;
create policy "days read" on public.shoot_days for select to authenticated using (public.is_member());
drop policy if exists "days admin write" on public.shoot_days;
create policy "days admin write" on public.shoot_days for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- people: signed-in people read everyone. You can add yourself, claim an unclaimed name,
-- and edit your own row. Admins can add, edit and remove anyone.
drop policy if exists "people read" on public.people;
create policy "people read" on public.people for select to authenticated using (public.is_member() or user_id = auth.uid());
drop policy if exists "people insert" on public.people;
create policy "people insert" on public.people for insert to authenticated
  with check ((user_id = auth.uid() and public.is_member()) or public.is_admin());
drop policy if exists "people update" on public.people;
create policy "people update" on public.people for update to authenticated
  using (((user_id = auth.uid() or user_id is null) and public.is_member()) or public.is_admin())
  with check ((user_id = auth.uid() and public.is_member()) or public.is_admin());
drop policy if exists "people admin delete" on public.people;
create policy "people admin delete" on public.people for delete to authenticated
  using (public.is_admin());

-- Roles are admin-only: once someone is on the list, only an admin can change
-- cast/crew, the characters they play, or their job.
create or replace function public.people_roles_admin_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (
       new.department is distinct from old.department
    or new.characters is distinct from old.characters
    or new.job        is distinct from old.job) then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end $$;
drop trigger if exists people_roles_admin_only on public.people;
create trigger people_roles_admin_only before update on public.people
  for each row execute function public.people_roles_admin_only();

-- availability: everyone signed in reads; you write your own answers; admins write anyone's.
drop policy if exists "avail read" on public.availability;
create policy "avail read" on public.availability for select to authenticated using (public.is_member());
drop policy if exists "avail write own" on public.availability;
create policy "avail write own" on public.availability for all to authenticated
  using (exists (select 1 from public.people p where p.id = person_id and ((p.user_id = auth.uid() and public.is_member()) or public.is_admin())))
  with check (exists (select 1 from public.people p where p.id = person_id and ((p.user_id = auth.uid() and public.is_member()) or public.is_admin())));

-- documents: everyone signed in reads; only admins upload, edit and remove.
drop policy if exists "docs read" on public.documents;
create policy "docs read" on public.documents for select to authenticated using (public.is_member());
drop policy if exists "docs insert" on public.documents;
create policy "docs insert" on public.documents for insert to authenticated
  with check (public.is_admin() and uploaded_by = auth.uid());
drop policy if exists "docs owner edit" on public.documents;
drop policy if exists "docs admin edit" on public.documents;
create policy "docs admin edit" on public.documents for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "docs owner delete" on public.documents;
drop policy if exists "docs admin delete" on public.documents;
create policy "docs admin delete" on public.documents for delete to authenticated
  using (public.is_admin());

-- Admins can make other people admins (or take it away) from the Manage page.
-- Nobody can change their own role, so there is always at least the admin who promoted them.
create or replace function public.set_user_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change roles'; end if;
  if new_role not in ('admin','member') then raise exception 'Unknown role %', new_role; end if;
  if target = auth.uid() then raise exception 'You can''t change your own role'; end if;
  update public.profiles set role = new_role where id = target;
end $$;
revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Admins approve new sign-ups (or take access away) from the Manage page.
create or replace function public.set_user_access(target uuid, allow boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can approve people'; end if;
  if target = auth.uid() then raise exception 'You can''t change your own access'; end if;
  update public.profiles set approved = allow where id = target;
end $$;
revoke all on function public.set_user_access(uuid, boolean) from public, anon;
grant execute on function public.set_user_access(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Storage buckets
--   headshots : public, images only, 10 MB each (cast board photos)
--   documents : private, 50 MB each (meeting notes, charts, PDFs…)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('headshots', 'headshots', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "headshots admin insert" on storage.objects;
create policy "headshots admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'headshots' and public.is_admin());
drop policy if exists "headshots admin update" on storage.objects;
create policy "headshots admin update" on storage.objects for update to authenticated
  using (bucket_id = 'headshots' and public.is_admin());
drop policy if exists "headshots admin delete" on storage.objects;
create policy "headshots admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'headshots' and public.is_admin());

drop policy if exists "documents read" on storage.objects;
create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_member());
drop policy if exists "documents upload" on storage.objects;
create policy "documents upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
drop policy if exists "documents owner delete" on storage.objects;
drop policy if exists "documents admin delete" on storage.objects;
create policy "documents admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- On-set photo gallery. Signed-in people see it; only admins add or remove photos.
--   gallery : private, images only, 15 MB each
-- ─────────────────────────────────────────────────────────────
create table if not exists public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  file_path   text not null unique,        -- path inside the 'gallery' bucket
  caption     text not null default '',
  taken_on    date,
  shoot_day   text references public.shoot_days on delete set null,
  uploaded_by uuid default auth.uid() references auth.users on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.gallery_photos enable row level security;
drop policy if exists "gallery read" on public.gallery_photos;
create policy "gallery read" on public.gallery_photos for select to authenticated using (public.is_member());
drop policy if exists "gallery admin write" on public.gallery_photos;
create policy "gallery admin write" on public.gallery_photos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', false, 15728640, array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists "gallery files read" on storage.objects;
create policy "gallery files read" on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and public.is_member());
drop policy if exists "gallery files admin insert" on storage.objects;
create policy "gallery files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and public.is_admin());
drop policy if exists "gallery files admin delete" on storage.objects;
create policy "gallery files admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Shoot days from the call sheets (Nov 29 – Dec 18, 2026).
-- Re-running updates them to these values.
-- ─────────────────────────────────────────────────────────────
insert into public.shoot_days
  (id, sort_order, day_label, shoot_date, title, location, address, scenes, crew_call, cast_call, wrap, characters, confirmed)
values
  ('d1a', 1, 'Day 1', '2026-11-29', 'Opening: Asante''s apartment & drive to work', 'Asante''s apartment', 'Address released to required actors', '1–5, 6, 7, 8–9', '11:00 AM', '12:00 PM', '4:00 PM', array['Asante','Gaia','Remy','Perceptron Rep']::text[], true),
  ('d1b', 2, 'Day 1 (cont.)', '2026-11-29', 'First dream sequence', 'Greensboro Science Center', '4301 Lawndale Dr., Greensboro, NC 27455', '14', '4:30 PM', '4:30 PM', '6:00 PM', array['Asante','Asante''s Dad','Ava']::text[], true),
  ('d3', 3, 'Day 2', '2026-12-01', 'The lab', 'Martin Engineering Building', 'NC A&T, 1101 E. Market St., Greensboro, NC 27411', '33, 35 (insert)', '6:00 PM', '7:00 PM', '12:00 AM', array['Asante','David','Michaela','Caught Scientist','Perceptron Rep']::text[], true),
  ('d2', 4, 'Day 3', '2026-12-02', 'Walk-up, the bathroom & the stairs', 'Martin Engineering Building', 'NC A&T, 1101 E. Market St., Greensboro, NC 27411', '12, 16, 17 (stairs)', '8:00 PM', '8:00 PM', '12:00 AM', array['Asante','Gaia','Eli','David','Tia','Random (bathroom)']::text[], true),
  ('d4', 5, 'Day 4', '2026-12-06', 'The nursing home', 'Well Springs Nursing Home', '4100 Well Spring Dr., Greensboro, NC 27410', '9 (end), 10', '11:00 AM', '12:00 PM', '4:00 PM', array['Asante','Remy','Eli']::text[], false),
  ('d8', 6, 'Day 5', '2026-12-10', 'The kitchen', 'City Kitch', '601 Milner Dr., Greensboro, NC 27410', '11', '1:00 PM', '2:00 PM', '7:00 PM', array['Asante','Gaia','Tia','Veronica']::text[], false),
  ('d10', 7, 'Day 6', '2026-12-13', 'The body bags', 'Lake Daniel Park', '410 Mimosa Dr., Greensboro, NC 27403', '26, 27', '12:00 PM', '12:30 PM', '5:00 PM', array['Asante','Gaia','Eli','David','Sage','Michaela']::text[], true),
  ('d11', 8, 'Day 7', '2026-12-14', 'Camp: storm night, Day 1, the party & Day 2', 'Glenn McNairy Library', '4860 Lake Jeanette Rd., Greensboro, NC 27455', '13, 15, 19 (party), 21, 23', '10:00 AM', '11:00 AM', '6:00 PM', array['Asante','Gaia','Eli','David','Remy','Veronica','Michaela','Tia','Sage']::text[], true),
  ('d12', 9, 'Day 8', '2026-12-15', 'Camp: spades, the fight, the plan & Day 5', 'Glenn McNairy Library', '4860 Lake Jeanette Rd., Greensboro, NC 27455', '24, 25, 28, 31, 34 (camp)', '9:15 AM', '10:30 AM', '4:30 PM', array['Asante','Gaia','Eli','David','Sage','Michaela','Remy']::text[], true),
  ('d14', 10, 'Day 9', '2026-12-16', 'Around the shelter: Day 1 & going after Sage', 'Glenwood Branch Library', 'Meeting Room, 1901 W. Florida St., Greensboro, NC 27403', '17 (diaper line), 18, 19 (Sage), 20', '12:30 PM', '1:30 PM', '8:15 PM', array['Asante','Gaia','Eli','David','Tia','Veronica','Random Man','Michaela','Sage','Food Runner 1','Food Runner 2','Food Runner 3','Ava','Cole']::text[], false),
  ('d15', 11, 'Day 10', '2026-12-17', 'Around the shelter: Gaia wakes, the office & the escape', 'Glenwood Branch Library', 'Meeting Room, 1901 W. Florida St., Greensboro, NC 27403', '22, 29, 30, 32, 33 (insert), 34 (Gaia & Eli), 35 (interior)', '10:00 AM', '11:00 AM', '4:00 PM', array['Asante','Gaia','Eli','David','Sage','Tia','Michaela']::text[], false),
  ('d13', 12, 'Day 11', '2026-12-18', 'Final scene: the truck', 'Location TBD', 'To be announced', '35 (exterior)', 'TBD', 'TBD', 'TBD', array['Asante','Gaia','Eli','Michaela','Truck Driver']::text[], false)

on conflict (id) do update set
  sort_order = excluded.sort_order, day_label = excluded.day_label, shoot_date = excluded.shoot_date,
  title = excluded.title, location = excluded.location, address = excluded.address, scenes = excluded.scenes,
  crew_call = excluded.crew_call, cast_call = excluded.cast_call, wrap = excluded.wrap,
  characters = excluded.characters, confirmed = excluded.confirmed;

-- ─────────────────────────────────────────────────────────────
-- Calendar: anyone on the people list can mark any date (not just
-- call dates) as available, tentative or unavailable. A reason is
-- required unless they're available.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.calendar_entries (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people on delete cascade,
  entry_date  date not null,
  status      text not null check (status in ('available','tentative','unavailable')),
  time_note   text not null default '',     -- e.g. "after 5 PM", "mornings only"
  reason      text not null default '',
  created_by  uuid default auth.uid() references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  unique (person_id, entry_date),
  constraint cal_reason_required check (status = 'available' or char_length(btrim(reason)) >= 3)
);
alter table public.calendar_entries enable row level security;

drop policy if exists "cal read" on public.calendar_entries;
create policy "cal read" on public.calendar_entries for select to authenticated using (public.is_member());
drop policy if exists "cal write own" on public.calendar_entries;
create policy "cal write own" on public.calendar_entries for all to authenticated
  using (exists (select 1 from public.people p where p.id = person_id and ((p.user_id = auth.uid() and public.is_member()) or public.is_admin())))
  with check (exists (select 1 from public.people p where p.id = person_id and ((p.user_id = auth.uid() and public.is_member()) or public.is_admin())));

-- Live updates: the calendar and availability pages refresh when anyone saves.
do $$ begin
  alter publication supabase_realtime add table public.calendar_entries;
exception when duplicate_object or undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.availability;
exception when duplicate_object or undefined_object then null; end $$;

-- Starter cast board: the ensemble cast only, no actor names or photos yet.
-- Only added when the board is empty.
insert into public.cast_cards (character, blurb, sort_order)
select * from (values
  ('Asante',   'Front desk at the nursing home. Always late, always asleep. The dreams are getting worse.', 1),
  ('Gaia',     'Asante''s best friend. Former nurse who still treats people who can''t afford a hospital.', 2),
  ('Eli',      'Twenty, loyal, and never far from his speaker.', 3),
  ('David',    'Sets up camp next to them in the shelter. Knows more than he says.', 4),
  ('Sage',     'Sixteen and furious, and she''s not wrong.', 5)
) as v(character, blurb, sort_order)
where not exists (select 1 from public.cast_cards);

-- An earlier version of this file also added Michaela, Remy, Tia and Veronica.
-- Remove those starter cards, but only if nobody has filled them in yet.
delete from public.cast_cards
where character in ('Michaela','Remy','Tia','Veronica') and actor_name = '' and photo_path is null;

-- ─────────────────────────────────────────────────────────────
-- LAST STEP — make yourself an admin. Sign in on the site once, then run
-- this with your own email address:
--
--   update public.profiles set role = 'admin', approved = true
--   where id = (select id from auth.users where email = 'you@example.com');
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- Announcements (also available on its own as announcements.sql)
-- ─────────────────────────────────────────────────────────────
-- Announcements, with an optional virtual-meeting link and time.
-- Safe to re-run. Paste into the Supabase SQL Editor.
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(btrim(title)) between 2 and 120),
  body          text not null default '' check (char_length(body) <= 4000),
  pinned        boolean not null default false,
  meeting_at    timestamptz,                                   -- optional: when the virtual meeting starts
  meeting_link  text check (meeting_link is null or meeting_link ~* '^https://[^\s]+$'),
  created_by    uuid default auth.uid() references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.announcements enable row level security;

drop policy if exists "announcements read" on public.announcements;
create policy "announcements read" on public.announcements for select to authenticated using (public.is_member());
drop policy if exists "announcements admin write" on public.announcements;
create policy "announcements admin write" on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$ begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object or undefined_object then null; end $$;

-- Specific times on calendar dates, several windows per day (also available as calendar_times.sql)
-- Specific times on calendar dates, with several windows per person per day.
-- Leave start_time and end_time null for "all day". Safe to re-run.
alter table public.calendar_entries add column if not exists start_time time;
alter table public.calendar_entries add column if not exists end_time   time;

alter table public.calendar_entries drop constraint if exists cal_time_window;
alter table public.calendar_entries add constraint cal_time_window
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time));

-- A date used to allow one entry per person. Now: one all-day entry, or any number of different time windows.
alter table public.calendar_entries drop constraint if exists calendar_entries_person_id_entry_date_key;
create unique index if not exists cal_one_all_day   on public.calendar_entries (person_id, entry_date) where start_time is null;
create unique index if not exists cal_one_per_start on public.calendar_entries (person_id, entry_date, start_time) where start_time is not null;

-- Saves a window for one person across one or more dates as a single transaction: either everything
-- is saved or nothing changes. All day (p_start null) replaces whatever the person had on those dates;
-- a time window replaces any all-day entry and any window it overlaps.
-- It runs with the caller's permissions, so people can still only change their own dates.
create or replace function public.save_calendar_window(
  p_person uuid, p_dates date[], p_status text, p_reason text, p_note text, p_start time, p_end time
) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if coalesce(array_length(p_dates, 1), 0) = 0 then raise exception 'Pick at least one date'; end if;
  if array_length(p_dates, 1) > 63 then raise exception 'That is more than 63 days at once'; end if;

  if p_start is null then
    delete from public.calendar_entries where person_id = p_person and entry_date = any (p_dates);
  else
    delete from public.calendar_entries
    where person_id = p_person and entry_date = any (p_dates)
      and (start_time is null or (start_time < p_end and end_time > p_start));
  end if;

  insert into public.calendar_entries (person_id, entry_date, status, reason, time_note, start_time, end_time, created_by)
  select p_person, d, p_status, coalesce(p_reason, ''), coalesce(p_note, ''), p_start, p_end, auth.uid()
  from unnest(p_dates) as d;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.save_calendar_window(uuid, date[], text, text, text, time, time) to authenticated;

-- Extras as a third role (also available as extras.sql)
-- Adds "extra" as a third role next to cast and crew. Safe to re-run.
-- Extras are stored with the one character "Extras", so an event is on their call sheet
-- when "Extras" is ticked in Manage → Events.
alter table public.people drop constraint if exists people_department_check;
alter table public.people add constraint people_department_check check (department in ('cast','crew','extra'));

-- Sign-up now accepts department = 'extra'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nm    text  := btrim(coalesce(meta->>'full_name', ''));
  dept  text  := meta->>'department';
  jb    text  := btrim(coalesce(meta->>'job', ''));
  chars text[];
  match uuid;
begin
  insert into public.profiles (id, full_name, approved)
  values (new.id, nm, new.invited_at is not null)
  on conflict (id) do nothing;

  if dept in ('cast','crew','extra') and char_length(nm) >= 2 then
    begin
      chars := coalesce(array(select jsonb_array_elements_text(
                 case when jsonb_typeof(meta->'characters') = 'array' then meta->'characters' else '[]'::jsonb end)), '{}');
      select id into match from public.people
        where user_id is null and lower(btrim(name)) = lower(nm) limit 1;
      if match is not null then
        update public.people set user_id = new.id where id = match;
      else
        insert into public.people (name, department, characters, job, user_id, created_by)
        values (nm, dept,
                case when dept = 'cast' then chars when dept = 'extra' then array['Extras'] else '{}' end,
                case when dept = 'crew' then jb else '' end,
                new.id, new.id);
      end if;
    exception when others then
      null;  -- never block a sign-up over the roster; an admin can add them on Manage
    end;
  end if;
  return new;
end $$;
