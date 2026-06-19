# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Marketing and user-facing website for MepSketcher (a MEP CAD tool). Static HTML/CSS/Vanilla JS frontend, Supabase backend, Paddle payments.

**Stack:** HTML + CSS + Vanilla JS (no build step) · Supabase (Auth, PostgreSQL, Edge Functions in Deno/TypeScript) · Paddle v2 · Github Pages (hosting)

## Documentation Map

Start at **[docs/INDEX.md](docs/INDEX.md)** — concise overview of architecture, auth, edge functions, database, payments, licensing, admin panel, deployment, and conventions. Use it as the entry point before reading code. (Older planning docs live in `docs/implementation-plans/`.)

## Development

**No build process.** Open any HTML file directly in a browser or serve locally:

```bash
npx serve .           # simple local server
```

**Admin panel** (local only, requires `.env`):

```bash
npm install           # installs express, dotenv, @supabase/supabase-js
npm start             # starts Express server at http://localhost:3000
```

Create `.env` from `.env.example` — requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service role key, not anon key).

**Supabase Edge Functions:**

```bash
npx supabase functions serve <function-name>   # local dev
npx supabase functions deploy <function-name>  # deploy
npx supabase db push                           # apply migrations
```

## Architecture

### Frontend Pages → JS Modules

Each HTML page includes scripts in this order:

1. Supabase CDN (`@supabase/supabase-js`)
2. `js/paddle-environment.js` → `js/paddle-config.sandbox.js` + `js/paddle-config.production.js` → `js/paddle-config.js`
3. `js/supabase-config.js` (hardcoded production URL + anon key)
4. `js/auth.js` (initializes auth, sets `window.supabase`)
5. Page-specific JS (e.g., `js/dashboard.js`, `js/main.js`)

### Auth Flow

`AuthService` in `js/auth.js` dispatches two custom DOM events:

- `authReady` — fired once on init; `detail.authenticated` indicates session state
- `authStateChanged` — fired on sign-in/sign-out

Pages listen for `authReady` before checking auth state. `window.supabase` is the shared client set by `auth.js`.

**Signup/signin do NOT call Supabase Auth directly** — they call Supabase Edge Functions (`/functions/v1/signup`, `/functions/v1/signin`) which run custom logic (org creation, trial provisioning, pending org processing) before establishing the session.

Password reset is handled entirely by edge functions (`reset-password-request`, `confirm-password-reset`) — not `supabase.auth.resetPasswordForEmail`.

### Paddle Environment Switching

Edit `js/paddle-environment.js` to toggle between `'sandbox'` and `'production'`. This file is committed and currently set to `'production'`. Switch to `'sandbox'` on a feature branch for testing; revert before merging to `main`.

### Supabase Edge Functions

Located in `supabase/functions/`. Each is a Deno TypeScript function. Key functions:

| Function                                                      | Purpose                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `signup`                                                      | Creates user + org, handles invitation tokens                              |
| `signin`                                                      | Authenticates, processes pending orgs, refreshes JWT claims                |
| `set-org-claims`                                              | Sets custom JWT claims for org/role                                        |
| `paddle-webhook`                                              | Handles Paddle payment events (JWT verification disabled in `config.toml`) |
| `send-invitation-email`                                       | Sends org member invitations via Resend                                    |
| `send-verification-reminders`                                 | Daily pg_cron job; resends confirmation email to unconfirmed signups (3d/7d) |
| `license-expiration-checker`                                  | Checks and updates expiring licenses                                       |
| `schedule-license-change` / `apply-scheduled-license-changes` | Deferred seat changes                                                      |

**Edge function secrets:** functions read Supabase keys from `SUPABASE_SECRET_KEYS` and `SUPABASE_PUBLISHABLE_KEYS` (JSON; use the `['default']` entry) — the new Supabase API key format. The legacy `SUPABASE_SERVICE_ROLE_KEY` env var is **no longer used by any edge function** (only `admin-server.js` still uses it locally via `.env`). Full secret list: [docs/overview/edge-functions.md](docs/overview/edge-functions.md).

### Database

Migrations in `supabase/migrations/` (timestamp-prefixed, e.g. `20260617_verification_reminders.sql` — latest applied). `DATABASE_*.sql` files in that dir and `setup-*-cron.sql` are one-off scripts applied **manually** via the Supabase SQL editor / CLI — not part of the migration sequence. Schema reference: [docs/overview/database.md](docs/overview/database.md).

Recurring jobs run via **pg_cron** inside Postgres (calling edge functions over `pg_net`), e.g. `verification-reminders-daily`. See [docs/overview/deployment.md](docs/overview/deployment.md).

### Admin Panel

`admin-server.js` is a local Express server that uses the Supabase service role key to bypass RLS for full data access. **Never deploy this.** Runs on `localhost:3000` only.

## Key Constraints

- `supabase-config.js` contains the production anon key in plaintext — this is intentional (it's a public key, safe to expose). The service role key must stay in `.env` (admin panel only) and never be committed.
- Edge functions authenticate with `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` (JSON, `['default']`), not `SUPABASE_SERVICE_ROLE_KEY`.
- The `paddle-webhook` edge function has `verify_jwt = false` in `supabase/config.toml` — required because Paddle calls it without a Supabase JWT.
- `js/supabase-config.local.js` is gitignored — used to override the Supabase URL/key for local Supabase dev.
