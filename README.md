# Cerulean (React + Vite)

The Cerulean production site, rebuilt as a React app. Same pages and the same Supabase database as the original
HTML site (`../cerulean-site`), with Animate UI / Motion animations.

## Run it

```powershell
cd C:\Users\40sst\cerulean_site\Cerulean\cerulean-app
copy .env.example .env      # skip if .env already has your values
npm install                 # first time only
npm run dev                 # http://localhost:8765
```

`.env` needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or the legacy `SUPABASE_ANON_KEY`). Vite only exposes
those names (plus `VITE_*`) to the browser, so a secret key in `.env` would stay private. Restart after editing `.env`.

Other commands: `npm run build` (production bundle in `dist/`), `npm run preview`, `npm run typecheck`.

The database setup is unchanged: run `../cerulean-site/supabase/schema.sql` once in the Supabase SQL Editor, add
`http://localhost:8765/*` under Authentication > URL Configuration > Redirect URLs, and make yourself an admin.

## What's where

| Page | Route |
|---|---|
| Home (hero, countdown, timeline, cast board) | `/` |
| Sign in / Sign up | `/login`, `/signup` |
| Calendar | `/calendar` |
| Call dates (availability) | `/availability` (`#board` for "Who's coming") |
| On set (helix + contact sheet) | `/gallery` |
| Past meetings | `/files` |
| Manage (admins) | `/admin` (`#roles`, `#access`) |

## Animation

- **Animate UI** (`@animate-ui/react`): tabs (sliding highlight + panels), dialogs, sliding-number countdown,
  counting-number stats, tilt on the polaroids. `npx @animate-ui/cli@latest animate all` swapped the shadcn
  dialog/tabs in `src/components/ui/` for the animated versions.
- **Motion** (`motion`): page transitions, nav indicator, scroll reveals, calendar/chart/heatmap, the helix.
- **Helix gallery** (`src/components/Helix.tsx`): custom 3D spiral. Scroll, drag sideways or use arrow keys. It is
  my own implementation, not the Motion+ source. A Grid toggle gives the contact sheet, which is also the default
  when the OS "reduce motion" setting is on.
