# Edge Functions

[← Index](../INDEX.md)

Deno/TypeScript functions in `supabase/functions/`. All have `verify_jwt = false` in `supabase/config.toml` (auth is handled in-function or by a shared secret).

## Supabase key format (important)

Functions read Supabase keys from JSON env vars, taking the `['default']` entry:

```ts
const secretKey      = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!)['default'];      // admin/service client
const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)['default']; // anon client
```

This is Supabase's **new publishable/secret API key format**. The legacy `SUPABASE_SERVICE_ROLE_KEY` env var is **no longer used by any edge function** (only the local `admin-server.js` still uses it via `.env`).

## Functions

| Function | Purpose | Notable secrets (beyond `SUPABASE_URL` + `SUPABASE_SECRET_KEYS`) |
|----------|---------|------------------------------------------------------------------|
| `signup` | Create user + org, handle invites | — |
| `signin` | Auth, process pending orgs, refresh claims | `SUPABASE_PUBLISHABLE_KEYS` |
| `set-org-claims` | Set custom JWT claims (org/role) | — |
| `assign-trial-user` | Provision personal trial org | — |
| `verify-email` | Confirm signup token | — |
| `send-verification-email` | Send confirm email | `RESEND_API_KEY`, `SITE_URL` |
| `send-verification-reminders` | Daily cron: resend confirm to unconfirmed signups (3d/7d) | `REMINDER_CRON_SECRET`, `RESEND_API_KEY`, `SITE_URL` |
| `reset-password-request` | Start password reset | `RESEND_API_KEY`, `SITE_URL` |
| `confirm-password-reset` | Finish password reset | — |
| `send-invitation-email` | Email org invite | `RESEND_API_KEY`, `SITE_URL` |
| `verify-invitation-token` | Validate invite token | — |
| `paddle-webhook` | Handle Paddle events | `PADDLE_WEBHOOK_SECRET` |
| `create-custom-price` | Paddle custom/volume price | `PADDLE_API_KEY`, `PADDLE_ENVIRONMENT`, `PADDLE_PRODUCT_ID` |
| `add-subscription-items` | Add seats to a subscription | `PADDLE_API_KEY`, `PADDLE_ENVIRONMENT`, `PADDLE_PRODUCT_ID` |
| `schedule-license-change` | Queue a seat change | — |
| `apply-scheduled-license-changes` | Apply queued seat changes | `PADDLE_API_KEY`, `PADDLE_ENVIRONMENT` |
| `license-expiration-checker` | Flag/notify expiring licenses | `RESEND_API_KEY` |
| `send-quote-request` | Email a sales quote request | `RESEND_API_KEY` |
| `cleanup-orphaned-orgs` | Delete orphaned personal-trial orgs | `CLEANUP_SECRET_KEY` |

## Secret reference

| Secret | Used by |
|--------|---------|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` | nearly all functions |
| `SUPABASE_PUBLISHABLE_KEYS` | `signin` |
| `RESEND_API_KEY`, `SITE_URL` | all email senders |
| `PADDLE_API_KEY`, `PADDLE_ENVIRONMENT`, `PADDLE_PRODUCT_ID` | Paddle-calling functions |
| `PADDLE_WEBHOOK_SECRET` | `paddle-webhook` |
| `REMINDER_CRON_SECRET` | `send-verification-reminders` (cron caller must send it as Bearer token) |
| `CLEANUP_SECRET_KEY` | `cleanup-orphaned-orgs` |

Set secrets in Dashboard → Edge Functions → Secrets, or via CLI. Deploy: `npx supabase functions deploy <name>`. See [Deployment](deployment.md).
