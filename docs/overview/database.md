# Database

[← Index](../INDEX.md)

Postgres on Supabase. Auth users live in `auth.users` (Supabase-managed); app data in `public.*`. Org IDs are `text` (UUID-as-text); user IDs are `text` matching `auth.users.id`.

## Tables (public)

| Table | Key columns | Notes |
|-------|-------------|-------|
| `organizations` | `id`, `name`, `owner_id`, `is_trial`, `trial_expires_at`, `is_personal_trial_org` | Trial default 14 days. Personal-trial orgs are auto-created and cleaned up. |
| `organization_members` | `organization_id`, `user_id`, `email`, `role`, `status`, `has_license`, `invite_token_hash`, `invitation_expires_at` | `role` ∈ owner/admin/member; `status` active/invited/removed. |
| `organization_licenses` | `organization_id`, `total_licenses`, `used_licenses`, `license_type`, `expires_at`, `paddle_id`, `subscription_id`, `scheduled_total_licenses`, `scheduled_change_at` | Seat pool per org. `scheduled_*` = deferred seat changes applied at renewal. |
| `pending_organizations` | `user_email` (unique), `organization_name`, `user_name`, `user_id`, `reminder_count`, `last_reminder_at` | Holds signups awaiting email confirmation. Reminder columns added 2026-06-17. |
| `user_profiles` | `id`, `email`, `name` | Mirror of auth user basics. |
| `email_verification_tokens` | token, expiry | Custom email-confirm flow. |
| `password_reset_tokens` | token, expiry | Custom reset flow. |
| `license_notifications` | — | Tracks which expiry notices were sent. |
| `license_renewal_history` | — | Audit of renewals. |

## RPCs (notable)

- `get_due_verification_reminders()` — unconfirmed signups due a reminder (1st @3d, 2nd @7d). `SECURITY DEFINER`, execute granted to `service_role` only (returns PII).
- `find_user_by_email` — lookup helper (migration `20260611`).

## Migrations vs one-off scripts

`supabase/migrations/`:
- **Timestamped** (`YYYYMMDD_*.sql`) = the migration sequence, applied via `npx supabase db push`. Latest: `20260617_verification_reminders.sql`.
- **`DATABASE_*.sql`** and **`setup-*-cron.sql`** = manual one-off scripts. Run by hand in the Supabase SQL editor; **not** part of the sequence.

Full column dump: [../SUPABASE_SCHEMA.json](../SUPABASE_SCHEMA.json).
