# Verification Reminder Email — Design

**Date:** 2026-06-17
**Branch:** `feature/verification-reminder-email`
**Status:** Approved

## Problem

Users who sign up via the regular (non-invitation) flow must confirm their email
before their organization is provisioned. Some never click the confirmation link —
the email is missed, lost, or buried in junk. Those accounts sit unconfirmed forever.

We want to automatically resend the confirmation email as a reminder a few days
after signup.

## Background — current flow

- `signup` edge function creates an `auth.users` row with `email_confirm: false`,
  inserts a `pending_organizations` row, and calls `send-verification-email`.
- `send-verification-email` mints a token into `email_verification_tokens`
  (24h expiry) and emails a verify link via Resend.
- `verify-email` validates the token and sets `email_confirmed_at`. It does **not**
  delete the pending row.
- On first sign-in after confirmation, `signin` provisions the org and deletes the
  `pending_organizations` row.

So a `pending_organizations` row means "signed up, org not yet provisioned" — which
includes both unconfirmed users and confirmed-but-never-logged-in users. The
authoritative "not confirmed" signal is `auth.users.email_confirmed_at IS NULL`.

## Decisions

- **Cadence:** two reminders — first at 3 days after signup, second at 7 days — then stop.
- **Scope:** reminders only. No deletion of stale unconfirmed accounts (separate task).
- **Targeting:** key off `auth.users.email_confirmed_at IS NULL`, not the pending row alone.
- **Token reuse:** dedicated reminder function mints its own fresh token and sends a
  reminder-worded email (correct tone), rather than reusing `send-verification-email`.

## Architecture

Email send requires a Resend HTTP call, so the work lives in an edge function.
A daily Postgres cron job (`pg_cron` + `pg_net`) invokes it.

```
pg_cron (daily 09:00 UTC)
   └── net.http_post → send-verification-reminders edge function
          ├── rpc get_due_verification_reminders()   (which users are due)
          └── per user: mint token → Resend send → bump counters
```

### 1. Migration `supabase/migrations/20260617_verification_reminders.sql`

- `ALTER TABLE pending_organizations`
  - `ADD COLUMN reminder_count int NOT NULL DEFAULT 0`
  - `ADD COLUMN last_reminder_at timestamptz`
- `CREATE FUNCTION public.get_due_verification_reminders()` — `SECURITY DEFINER`,
  returns the rows due for a reminder. Joins `pending_organizations` to `auth.users`
  on `lower(email) = lower(user_email)`. Returns:
  `pending_id`, `auth_id` (uuid), `user_email`, `user_name`, `organization_name`,
  `reminder_count`.
  Due conditions (`email_confirmed_at IS NULL` always required):
  - `reminder_count = 0 AND created_at <= now() - interval '3 days'`  → 1st reminder
  - `reminder_count = 1 AND created_at <= now() - interval '7 days'`  → 2nd reminder
  Keeps the OR/window logic in SQL so the edge function stays simple.

### 2. Edge function `supabase/functions/send-verification-reminders/index.ts`

- `verify_jwt = false`. Authorizes on `Authorization: Bearer <REMINDER_CRON_SECRET>`
  against an env var. (New Supabase secret keys aren't JWTs, so JWT verification of a
  cron caller doesn't apply — same rationale as `paddle-webhook`.)
- Supports `?dryRun=true`: returns the due list, sends nothing, changes no counters —
  safe to test against live unconfirmed users.
- Uses the service-role key (`SUPABASE_SECRET_KEYS` JSON `default`) to call
  `rpc('get_due_verification_reminders')`.
- Per due user:
  1. Generate a secure token (same scheme as `send-verification-email`), insert into
     `email_verification_tokens` with **72h** expiry (more lenient than signup's 24h
     since it's a nudge), `verified = false`.
  2. Send a reminder email via Resend (multipart html + text, from
     `noreply@mepsketcher.com`, subject "Reminder: confirm your MepSketcher account",
     body notes they signed up but haven't confirmed, includes fresh verify link
     `${SITE_URL}/verify-email.html?token=...`).
  3. On success: `UPDATE pending_organizations SET reminder_count = reminder_count + 1,
     last_reminder_at = now() WHERE id = pending_id`.
  4. On failure: do **not** bump counters (so it retries next day). Per-user
     try/catch, continue to next.
- Returns `{ processed, sent, skipped, errors }`.
- Reuses existing env vars `RESEND_API_KEY`, `SITE_URL`, `SUPABASE_URL`,
  `SUPABASE_SECRET_KEYS`.
- `deno.json` mirrors `send-verification-email`.

### 3. `supabase/config.toml`

Add:
```toml
[functions.send-verification-reminders]
verify_jwt = false
```

### 4. Cron setup `setup-verification-reminders-cron.sql` (repo root)

Manual-apply (matches the repo convention that root SQL files are one-off scripts run
via the dashboard, not part of the migration sequence). The cron secret is a
placeholder and is never committed:

- Enable `pg_cron` and `pg_net` extensions.
- `cron.schedule('verification-reminders-daily', '0 9 * * *', ...)` →
  `net.http_post` to
  `https://jskwfvwbhyltmxcdsbnm.supabase.co/functions/v1/send-verification-reminders`
  with header `Authorization: Bearer <REMINDER_CRON_SECRET>`.

### 5. New secret

`REMINDER_CRON_SECRET` — set in Supabase function secrets and referenced in the cron
SQL. Random high-entropy string.

## Error handling

- Per-user isolation: one failed send/insert doesn't abort the batch.
- Counters only advance on successful send, giving automatic next-day retry.
- Function returns counts; failures are logged via `console.error`.

## Edge cases

- **Legacy pending rows with null `user_id`:** join is on email, so unaffected; the
  uuid needed for the token comes from `auth.users.id` via the rpc.
- **Multiple pending rows for one email:** rare; each would be processed. Acceptable.
- **User confirms between selection and send:** small race; selection filters
  `email_confirmed_at IS NULL`. Worst case one stray reminder. Acceptable.
- **Old 24h token still valid:** reminder always mints a fresh token; the stale one is
  harmless.

## Test plan

- Live data at design time: 5 pending rows, 2 unconfirmed users (both > 3 days old).
- `dryRun=true` invocation → confirm both unconfirmed users appear, nothing sent.
- Real invocation → confirm reminder emails arrive, `reminder_count` = 1,
  `last_reminder_at` set.
- Re-invoke same day → those users no longer due (count=1, < 7 days) → no double-send.
- Wrong/missing secret → 401, no work done.

## Out of scope

- Deleting stale unconfirmed accounts.
- Deliverability / junk-mail hardening (SPF/DKIM/DMARC) — separate follow-up task.
- Front-end "resend verification" button.
