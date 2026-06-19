# MepSketcher Website — Documentation Index

Entry point for the marketing + user-facing website (frontend, Supabase backend, Paddle payments). Each section below is a small, focused page. Start here, jump to what you need.

> For the C# desktop app, see the separate `MepSketcher` repo — not covered here.

## Sections

| Page | What's in it |
|------|--------------|
| [Architecture](overview/architecture.md) | Repo map, pages → JS modules, script load order, hosting |
| [Auth](overview/auth.md) | Signup/signin via edge functions, session flow, password reset |
| [Edge Functions](overview/edge-functions.md) | Every function + its secrets, the new Supabase key format |
| [Database](overview/database.md) | Tables, relationships, migrations vs one-off scripts |
| [Payments & Licensing](overview/payments-licensing.md) | Paddle env switching, webhook, license/trial/seat model |
| [Admin Panel](overview/admin-panel.md) | Local-only Express server (service role key) |
| [Deployment](overview/deployment.md) | Hosting, edge-function deploy, secrets, pg_cron jobs |
| [Conventions & Gotchas](overview/conventions.md) | Branch workflow, things that bite you |

## Fast facts

- **No build step.** Static HTML/CSS/vanilla JS. Serve with `npx serve .`.
- **Backend = Supabase** (Auth, Postgres, Deno edge functions). Project ref `jskwfvwbhyltmxcdsbnm`.
- **Payments = Paddle v2.** Environment toggled in `js/paddle-environment.js`.
- **Auth is custom:** signup/signin call edge functions, not `supabase.auth` directly.
