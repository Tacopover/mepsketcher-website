# Conventions & Gotchas

[← Index](../INDEX.md)

## Branch / environment workflow

- Test Paddle on a feature branch with `js/paddle-environment.js` set to `'sandbox'`; **revert to `'production'` before merging to `main`**. The file is committed, so a stray `sandbox` value ships live.
- `js/supabase-config.local.js` is gitignored — local override for the Supabase URL/key when running a local Supabase stack.

## Keys & secrets

- `supabase-config.js` ships the **anon key in plaintext** — intentional, it's a public key.
- Edge functions: `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` (JSON, `['default']`). **Not** `SUPABASE_SERVICE_ROLE_KEY`.
- The service role key lives only in `.env` for the local admin panel — never commit it.

## Auth gotchas

- Don't add direct `supabase.auth.signUp/signIn` calls for the primary flow — go through the `signup` / `signin` edge functions so org/trial/invite/claims logic runs. See [Auth](auth.md).
- Emails are **lowercased** before storage/lookup (`pending_organizations.user_email`, etc.). Match that when querying.

## Database gotchas

- Two kinds of SQL in `supabase/migrations/`: timestamped migrations (`db push`) vs `DATABASE_*.sql` / `setup-*-cron.sql` (manual). Don't `db push` expecting the manual scripts to run.
- Org and user IDs are `text`, not `uuid` — joins/casts matter.
- `get_due_verification_reminders()` returns PII and is locked to `service_role`; keep it that way if you edit it.

## Docs

- Keep these overview pages **short**. Deep historical specs go in `docs/implementation-plans/`.
- This system is plain-markdown with relative links — renders in Obsidian and is cheap for agents to traverse from [INDEX](../INDEX.md).
