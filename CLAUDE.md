# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Marketing and user-facing website for MepSketcher (a MEP CAD tool). Static HTML/CSS/Vanilla JS frontend, Supabase backend, Paddle payments.

**Stack:** HTML + CSS + Vanilla JS (no build step) · Supabase (Auth, PostgreSQL, Edge Functions in Deno/TypeScript) · Paddle v2 · Github Pages (hosting)

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
| `license-expiration-checker`                                  | Checks and updates expiring licenses                                       |
| `schedule-license-change` / `apply-scheduled-license-changes` | Deferred seat changes                                                      |

### Database

Migrations in `supabase/migrations/`. Named SQL files in root are one-off fix scripts — apply manually via Supabase dashboard or CLI, not part of the migration sequence.

### Admin Panel

`admin-server.js` is a local Express server that uses the Supabase service role key to bypass RLS for full data access. **Never deploy this.** Runs on `localhost:3000` only.

## Key Constraints

- `supabase-config.js` contains the production anon key in plaintext — this is intentional (it's a public key, safe to expose). The service role key must stay in `.env` and never be committed.
- The `paddle-webhook` edge function has `verify_jwt = false` in `supabase/config.toml` — required because Paddle calls it without a Supabase JWT.
- `js/supabase-config.local.js` is gitignored — used to override the Supabase URL/key for local Supabase dev.
