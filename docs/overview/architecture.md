# Architecture

[← Index](../INDEX.md)

## Repo map

| Path | Contents |
|------|----------|
| `*.html` (root) | Pages: `index`, `login`, `dashboard`, `accept-invitation`, `verify-email`, `reset-password`, `purchase-success`, legal pages |
| `js/` | Frontend modules (vanilla JS, no bundler) |
| `css/` | `style.css`, `auth.css`, `admin.css`, `license-expiration.css` |
| `supabase/functions/` | Deno/TypeScript edge functions |
| `supabase/migrations/` | SQL migrations + manual one-off scripts |
| `admin-server.js` | Local-only Express admin panel |
| `docs/` | This documentation; `implementation-plans/` = historical specs |

## Pages → JS modules

| Page | Main module(s) |
|------|----------------|
| `index.html` | `main.js`, `pricing.js`, `paddle.js`, `lightbox.js` |
| `login.html` | `login-page.js` |
| `dashboard.html` | `dashboard.js` → imports `members-manager.js`, `license-expiration.js` (ES modules) |
| `admin.html` | `admin.js` (talks to local `admin-server.js`, not Supabase directly) |

## Script load order (every page)

1. Supabase CDN (`@supabase/supabase-js`)
2. `paddle-environment.js` → `paddle-config.sandbox.js` + `paddle-config.production.js` → `paddle-config.js`
3. `supabase-config.js` (hardcoded prod URL + anon key)
4. `auth.js` (creates client, sets `window.supabase`)
5. Page-specific JS

`auth.js` must load before page logic — it owns the shared `window.supabase` client and fires the `authReady` event pages wait on. See [Auth](auth.md).

## Hosting

GitHub Pages, custom domain `mepsketcher.com` (`CNAME`). See [Deployment](deployment.md).
