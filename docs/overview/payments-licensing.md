# Payments & Licensing

[← Index](../INDEX.md)

Payments via **Paddle v2**. Licenses are seat pools on `organization_licenses` (see [Database](database.md)).

## Paddle environment switching

`js/paddle-environment.js` sets `PADDLE_ENVIRONMENT = 'sandbox' | 'production'` (committed; currently `production`). It selects between `paddle-config.sandbox.js` and `paddle-config.production.js`, wrapped by `paddle-config.js`.

**Workflow:** switch to `'sandbox'` on a feature branch to test → revert to `'production'` before merging to `main`.

Config holds the client token (`live_*` / `test_*`), price IDs (`pri_*`), and redirect URLs. Checkout is opened client-side via `Paddle.Checkout.open({ items: [...] })`.

## Webhook

`paddle-webhook` edge function receives Paddle events (`verify_jwt = false` — Paddle has no Supabase JWT; it's verified with `PADDLE_WEBHOOK_SECRET`). It updates `organization_licenses` (seats, `subscription_id`, expiry) on purchase/renewal/cancel.

## License model

- **Trial:** new org gets `is_trial = true`, `trial_expires_at = now() + 14 days`. Trial users get an auto-created personal org (`is_personal_trial_org`).
- **Seats:** `total_licenses` vs `used_licenses`; members consume a seat when `has_license = true`.
- **Scheduled changes:** seat reductions/cancellations are deferred — stored in `scheduled_total_licenses` / `scheduled_change_at`, queued by `schedule-license-change`, applied at renewal by `apply-scheduled-license-changes`.
- **Expiration:** `license-expiration-checker` flags expiring licenses and sends notices (`license_notifications`).

## Paddle-calling functions

`create-custom-price` (volume quotes), `add-subscription-items` (add seats), plus the scheduled-change pair above. All need `PADDLE_API_KEY` + `PADDLE_ENVIRONMENT`.
