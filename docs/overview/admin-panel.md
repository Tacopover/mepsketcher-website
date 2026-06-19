# Admin Panel

[← Index](../INDEX.md)

`admin-server.js` — a **local-only** Express server for inspecting Supabase data with full access. **Never deploy it.**

## Run

```bash
npm install            # express, dotenv, @supabase/supabase-js
npm start              # http://localhost:3000   (npm run dev for nodemon)
```

Requires `.env` (copy from `.env.example`):

```
SUPABASE_URL=https://jskwfvwbhyltmxcdsbnm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key, NOT the anon key>
```

## How it works

- Uses the **service role key** to bypass RLS — this is the one place that key is still used (edge functions moved to `SUPABASE_SECRET_KEYS`; see [Edge Functions](edge-functions.md)).
- Server pre-joins/aggregates data and exposes read endpoints; `js/admin.js` + `admin.html` render the UI.
- Endpoints: `/api/statistics`, `/api/users-with-orgs`, `/api/organizations-with-stats`, `/api/members-with-details`, `/api/licenses-with-org`, `/api/pending-organizations`.

## Safety

- Binds to `localhost` only — never set it to `0.0.0.0`.
- `.env` is gitignored; never commit the service role key.
