# Email templates

Paste these into Supabase: **Authentication → Emails → Templates** (older dashboards: Authentication → Email Templates).

| Template in Supabase | File | Subject line |
| --- | --- | --- |
| **Confirm sign up** | `confirm-signup.html` | `Confirm your email for Cerulean` |
| **Magic Link** | `magic-link.html` | `Your Cerulean sign-in link` |

Both flows use `signInWithOtp`: a brand-new person gets *Confirm sign up*, someone who already has an account gets *Magic Link*.

1. Open the template, paste the file's whole contents into the message body, set the subject, and save.
2. Set **Authentication → URL Configuration → Site URL** to where the site lives (e.g. `http://localhost:8765` while testing), so the button lands on the right page.

The templates use Supabase's `{{ .ConfirmationURL }}` and `{{ .Email }}`. Fonts are Courier/Impact because email apps ignore web fonts.
