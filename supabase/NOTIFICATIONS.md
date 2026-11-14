# Approval emails

- A new sign-up waiting for approval → email to every admin (link to Manage).
- Someone gets approved → email to that person (link to sign in).

Uses a Supabase Edge Function (`functions/notify`) and Resend. About 10 minutes, once.

## 1. Resend
1. Create a free account at resend.com and make an API key.
2. For testing, the default sender `onboarding@resend.dev` only delivers to the email on your Resend account. To email everyone, add and verify your own domain in Resend, then set `FROM_EMAIL` below, for example `Cerulean <hello@yourdomain.com>`.

## 2. Deploy the function
Install the Supabase CLI, then from `cerulean-app/`:

```
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set RESEND_API_KEY=re_xxx WEBHOOK_SECRET=make-up-a-long-random-string SITE_URL=https://YOUR-SITE.netlify.app FROM_EMAIL="Cerulean <onboarding@resend.dev>"
supabase functions deploy notify --no-verify-jwt
```

`--no-verify-jwt` is needed because the webhook authenticates with your `WEBHOOK_SECRET` header instead.

## 3. Connect the database to the function
**Easiest:** open `supabase/notify_triggers.sql`, replace `YOUR-PROJECT-REF` and `YOUR-WEBHOOK-SECRET`, and run it in the SQL Editor. Then skip the dashboard steps below.

**Or in the dashboard,** two Database Webhooks (now under Integrations → Database Webhooks in newer dashboards):
Supabase dashboard → Database → Webhooks → Create a new hook. Make two:

| Name | Table | Events |
|---|---|---|
| `profile-created` | `public.profiles` | Insert |
| `profile-updated` | `public.profiles` | Update |

For both: type **Supabase Edge Functions**, function **notify**, method POST, and add the HTTP header `x-webhook-secret` with the same value as `WEBHOOK_SECRET`.

## Notes
- Admins are everyone whose role is `admin` in `profiles`. Make sure at least one exists.
- The admin email goes out when the account is created, which is when they sign up, before they confirm their email.
- People you invite are approved automatically and don't get either email.
- Check Database → Webhooks → logs, and Edge Functions → notify → Logs if an email doesn't arrive.
