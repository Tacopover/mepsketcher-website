# Auth

[← Index](../INDEX.md)

Auth is **custom** — the frontend does not call `supabase.auth.signUp` / `signInWithPassword` directly for the primary flow. It calls edge functions that run org/trial/invitation logic first, then establishes the Supabase session.

## Client (`js/auth.js`)

`AuthService` creates the shared client (`window.supabase`) and dispatches DOM events:

- `authReady` — fired once after init; `detail.authenticated` = session state. Pages wait for this before checking auth.
- `authStateChanged` — fired on sign-in / sign-out.

## Signup

`AuthService.signUp()` → `POST /functions/v1/signup` with `{ email, password, name, organizationName, invitationToken? }`.
The function creates the user + organization (or attaches to an invited org), provisions trial, and requires email confirmation. Email is **lowercased** before storage.

## Signin

`AuthService.signIn()`:
1. `POST /functions/v1/signin` — authenticates, processes any `pending_organizations` for that email (lowercased), refreshes JWT/org claims.
2. Then calls `supabase.auth.signInWithPassword()` to establish the browser session.

## Email verification

Custom tokens (`email_verification_tokens`), not Supabase's built-in confirm link:
- `send-verification-email` / `send-verification-reminders` — send confirm emails (Resend).
- `verify-email` — validates the token, marks the auth user confirmed.

## Password reset

Entirely edge-function driven (not `resetPasswordForEmail`):
- `reset-password-request` — generates token (`password_reset_tokens`), emails link.
- `confirm-password-reset` — validates token, updates password.

## Invitations

- `send-invitation-email` — emails an org invite (token hash stored on `organization_members`).
- `verify-invitation-token` — validates the token on `accept-invitation.html`.

Related: [Edge Functions](edge-functions.md) · [Database](database.md)
