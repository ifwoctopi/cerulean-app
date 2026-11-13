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
