# Deployment

[← Index](../INDEX.md)

## Frontend

Static site, no build. Hosted on **GitHub Pages**, custom domain `mepsketcher.com` (`CNAME`). Pushing to `main` publishes.

Local preview: `npx serve .`.

> Note: GitHub Pages can't set custom HTTP response headers, so header-only security controls (HSTS, X-Frame-Options, X-Content-Type-Options) are not enforced. CSP + referrer policy are set via `<meta>` tags in the HTML.

## Edge functions

```bash
npx supabase functions serve <name>    # local
npx supabase functions deploy <name>   # deploy to project
```

Secrets: Dashboard → Edge Functions → Secrets (or `supabase secrets set`). See the secret table in [Edge Functions](edge-functions.md). Helper: `supabase/setup-supabase-secrets.sh`.

## Migrations

```bash
npx supabase db push     # apply timestamped migrations
```

`DATABASE_*.sql` and `setup-*-cron.sql` are run **manually** in the SQL editor — not part of `db push`. See [Database](database.md).

## Scheduled jobs (pg_cron)

Recurring work runs inside Postgres via `pg_cron` + `pg_net` (HTTP POST to an edge function with a shared-secret Bearer token).

- **`verification-reminders-daily`** — `0 9 * * *` UTC → calls `send-verification-reminders` (Bearer = `REMINDER_CRON_SECRET`). Set up via `supabase/migrations/setup-verification-reminders-cron.sql` (one-off; fill the secret placeholder before running).

Inspect / manage:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
SELECT cron.unschedule('verification-reminders-daily');
```
