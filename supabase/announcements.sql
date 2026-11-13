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
