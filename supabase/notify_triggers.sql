-- Approval emails, step 3 as SQL (instead of creating two Database Webhooks in the dashboard).
-- Do steps 1 and 2 in supabase/NOTIFICATIONS.md first (Resend + deploy the "notify" function).
--
-- Before running, replace the two placeholders below:
--   YOUR-PROJECT-REF   your project reference (the part before .supabase.co in your project URL)
--   YOUR-WEBHOOK-SECRET   the same value you gave to `supabase secrets set WEBHOOK_SECRET=...`
-- Safe to re-run.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_profile_change()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'YOUR-WEBHOOK-SECRET'),
    body    := jsonb_build_object(
                 'type', tg_op, 'table', tg_table_name,
                 'record', to_jsonb(new),
                 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end)
  );
  return new;
exception when others then
  return new;  -- never block a sign-up or an approval because an email couldn't be queued
end $$;

drop trigger if exists profile_created_notify on public.profiles;
create trigger profile_created_notify after insert on public.profiles
  for each row execute function public.notify_profile_change();

drop trigger if exists profile_approved_notify on public.profiles;
create trigger profile_approved_notify after update of approved on public.profiles
  for each row when (old.approved is distinct from new.approved)
  execute function public.notify_profile_change();
