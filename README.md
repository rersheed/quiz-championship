# IMJ Group — Live Quiz Championship

A responsive React + TypeScript quiz championship frontend with a public homepage, animated live leaderboard, school directory, fullscreen projector display, a scorekeeper control panel, editable branding, and a Supabase SQL schema with RLS, atomic score updates and audit events.

## What works

- **Demo/preview mode:** Without Supabase credentials, the homepage, categories, school directory, scorekeeper panel and animated leaderboard work against fictional in-memory schools. Scores in demo mode disappear on refresh and are not shared between devices.
- **Connected mode:** With a configured Supabase backend, visitors see the publicly readable competition/groups/scores. Supabase Auth and the `admins` table govern scorekeeper access. Secure RPC functions enforce scoring/finalization permissions; score changes are audited. Subscription to the Supabase Realtime publication updates other connected viewers when scores change.
- **Branding:** Competition metadata, logo URL, and theme colour are loaded from Supabase. Authorized administrators can change branding through the control centre.

## Setup

1. Create a **new** Supabase project. Do not run the migrations against an unrelated project.
2. In SQL Editor, apply `supabase/schema.sql` and then optionally `supabase/seed.sql` (the seed contains fictional schools and should be replaced with the official registrations).
3. In Authentication > Users, create an administrator user (or enable email signups temporarily and register a user securely). Obtain the UUID of that account, then add it via the documented `insert into public.admins(...)` statement in `seed.sql`. Disable public signups if not wanted.
4. In project settings, find the API project URL and a **publishable** key. Do **not** use the service role / secret key in the browser.
5. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
6. Install dependencies using `npm install` and start with `npm run dev`.
7. Run `npm run build` for production output.

## GitHub Pages deployment

1. Create a public GitHub repository, e.g. `imj-quiz-championship`, and push this project's contents to its `main` branch.
2. Go to the repository Settings > Pages > Build and deployment, select **GitHub Actions**.
3. In repository Settings > Secrets and variables > Actions > Variables, set:
   - `VITE_SUPABASE_URL` — your project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — your public publishable key
4. Push to `main` or manually run the `Deploy GitHub Pages` workflow. It builds the app with the project-specific Vite base path.
5. The site URL generally resembles `https://YOUR_USER.github.io/imj-quiz-championship/`.
6. Add the GitHub Pages site URL as an allowed Site URL / redirect URL in Supabase Auth settings if using auth redirects.

The app uses internal view switching rather than browser-history navigation to avoid broken GitHub Pages deep-link refreshes. Custom domains require adjusting `VITE_BASE_PATH` in the workflow to `/`.

## Scope and limitations

This is an **initial, functional MVP**, not the full competition platform previously specified. The current UI supports sample categories, groups, viewing and scoring, a basic finalized state, and logo URL/theme customization. It does **not yet** include real admin-facing school registration, automated group formation, multi-round qualification bracket progression, semifinal/final tournament orchestration, bulk imports, sponsor management, advanced certificate generation, or sound/ceremony effects. The schema is suitable for extending those modules.

Scoring uses steps of 5 points in the UI; the SQL RPC accepts bounded integer adjustments. The database locks finalized groups against further updates. There is no final-result undo action in connected mode.

For significant audiences, move the current `postgres_changes` listener to trigger-based Supabase Broadcast and implement snapshot/version reconciliation. For a single modest event it is a reasonable starter, but it is not load-tested at large spectator scale.

## Security notes

- `public.admins` is **not** writable through the public client; bootstrap users via privileged Supabase SQL operations.
- Public select policies expose school names and scores; avoid entering student personal information in these tables.
- `adjust_score` and `finalize_group` run as audited, authorization-checking PostgreSQL functions; direct score writes are not granted.
- Protect your GitHub repository, Supabase account, and admin credentials. Never commit `.env.local`.

## Planned next milestones

1. Category/group/school/competition CRUD management with consistent category ownership validations.
2. Configurable rules, tied-score resolution, multi-stage advancement, six-school semifinal and four-school final.
3. Broadcast-channel optimization, synchronization tests, score review workflow, official reports and printed certificates.
