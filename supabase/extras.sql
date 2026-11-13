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
