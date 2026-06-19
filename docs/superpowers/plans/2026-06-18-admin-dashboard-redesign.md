# Admin Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat-table admin panel with a relational insight dashboard showing user status badges and expandable org cards with member lists.

**Architecture:** Express backend gains two new joined-query endpoints that use `supabase.auth.admin.listUsers()` plus parallel table fetches, joined in JS. Frontend is a full rewrite of `admin.html` / `js/admin.js` / `css/admin.css` — no build step, pure vanilla JS/CSS. Old endpoints remain untouched.

**Tech Stack:** Node.js + Express, `@supabase/supabase-js` v2, Vanilla JS (ES2020), CSS custom properties

## Global Constraints

- No build step — plain HTML/CSS/JS files served as static assets by Express
- Admin server is **local-only** — never deploy, no auth required
- Service role key comes from `.env` as `SUPABASE_SERVICE_ROLE_KEY`
- Read-only panel — no write/mutation operations
- `supabase.auth.admin.listUsers()` pagination: pass `{ perPage: 1000 }` to get all users in one call (adjust if user count ever exceeds 1000)
- Keep all existing `/api/*` endpoints in `admin-server.js` — do not remove them

---

### Task 1: Backend — two overview endpoints

**Files:**
- Modify: `admin-server.js` (append before the `app.get('/')` root route)

**Interfaces:**
- Produces:
  - `GET /api/overview/users` → `UserOverview[]`
  - `GET /api/overview/orgs` → `OrgOverview[]`

`UserOverview` shape:
```json
{
  "id": "uuid-string",
  "email": "string",
  "name": "string | null",
  "signed_up_at": "ISO string",
  "confirmed_at": "ISO string | null",
  "last_sign_in_at": "ISO string | null",
  "role": "admin | member | null",
  "member_status": "active | null",
  "has_license": "boolean | null",
  "accepted_at": "ISO string | null",
  "invite_token_hash": "string | null",
  "invitation_expires_at": "ISO string | null",
  "org_id": "string | null",
  "org_name": "string | null",
  "is_trial": "boolean | null",
  "org_trial_expires_at": "ISO string | null",
  "paddle_id": "string | null",
  "subscription_id": "string | null",
  "total_licenses": "number | null",
  "used_licenses": "number | null",
  "license_expires_at": "ISO string | null",
  "pending_org_id": "string | null",
  "pending_org_name": "string | null"
}
```

`OrgOverview` shape:
```json
{
  "id": "string",
  "name": "string",
  "owner_id": "string",
  "owner_email": "string | null",
  "is_trial": "boolean",
  "is_personal_trial_org": "boolean",
  "trial_expires_at": "ISO string | null",
  "created_at": "ISO string",
  "total_licenses": "number | null",
  "used_licenses": "number | null",
  "license_type": "string | null",
  "license_expires_at": "ISO string | null",
  "paddle_id": "string | null",
  "subscription_id": "string | null",
  "grace_period_start": "ISO string | null",
  "grace_period_end": "ISO string | null",
  "scheduled_total_licenses": "number | null",
  "scheduled_change_at": "ISO string | null",
  "member_count": "number",
  "members": "MemberDetail[]"
}
```

`MemberDetail` shape:
```json
{
  "user_id": "string",
  "email": "string | null",
  "name": "string | null",
  "role": "admin | member",
  "status": "active",
  "has_license": "boolean",
  "accepted_at": "ISO string | null",
  "invited_at": "ISO string | null",
  "invite_token_hash": "string | null",
  "invitation_expires_at": "ISO string | null"
}
```

- [ ] **Step 1: Add `/api/overview/users` endpoint**

Open `admin-server.js`. Insert the following block immediately before the `// Serve admin.html on root` comment (around line 278):

```javascript
// ============================================
// OVERVIEW: Users with joined org/license/status
// ============================================
app.get('/api/overview/users', async (req, res) => {
    try {
        const [
            { data: authData, error: authError },
            { data: profiles,  error: profilesError },
            { data: members,   error: membersError },
            { data: orgs,      error: orgsError },
            { data: licenses,  error: licensesError },
            { data: pending,   error: pendingError }
        ] = await Promise.all([
            supabase.auth.admin.listUsers({ perPage: 1000 }),
            supabase.from('user_profiles').select('*'),
            supabase.from('organization_members').select('*').neq('status', 'removed'),
            supabase.from('organizations').select('id, name, is_trial, trial_expires_at'),
            supabase.from('organization_licenses').select('organization_id, total_licenses, used_licenses, expires_at, paddle_id, subscription_id'),
            supabase.from('pending_organizations').select('*')
        ]);

        if (authError) throw authError;
        if (profilesError) throw profilesError;

        const profileMap  = Object.fromEntries((profiles  || []).map(p => [p.id, p]));
        const memberMap   = Object.fromEntries((members   || []).map(m => [m.user_id, m]));
        const orgMap      = Object.fromEntries((orgs      || []).map(o => [o.id, o]));
        const licenseMap  = Object.fromEntries((licenses  || []).map(l => [l.organization_id, l]));
        const pendingMap  = Object.fromEntries((pending   || []).map(p => [p.user_id, p]));

        const result = (authData.users || []).map(au => {
            const profile    = profileMap[au.id] || {};
            const member     = memberMap[au.id];
            const org        = member ? orgMap[member.organization_id] : null;
            const license    = org    ? licenseMap[org.id] : null;
            const pendingOrg = pendingMap[au.id];

            return {
                id:                    au.id,
                email:                 au.email || profile.email || null,
                name:                  profile.name || au.user_metadata?.name || null,
                signed_up_at:          au.created_at,
                confirmed_at:          au.email_confirmed_at || null,
                last_sign_in_at:       au.last_sign_in_at    || null,
                role:                  member?.role          || null,
                member_status:         member?.status        || null,
                has_license:           member?.has_license   ?? null,
                accepted_at:           member?.accepted_at   || null,
                invite_token_hash:     member?.invite_token_hash     || null,
                invitation_expires_at: member?.invitation_expires_at || null,
                org_id:                org?.id               || null,
                org_name:              org?.name             || null,
                is_trial:              org?.is_trial         ?? null,
                org_trial_expires_at:  org?.trial_expires_at || null,
                paddle_id:             license?.paddle_id       || null,
                subscription_id:       license?.subscription_id || null,
                total_licenses:        license?.total_licenses  ?? null,
                used_licenses:         license?.used_licenses   ?? null,
                license_expires_at:    license?.expires_at      || null,
                pending_org_id:        pendingOrg?.id                || null,
                pending_org_name:      pendingOrg?.organization_name || null
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error in /api/overview/users:', error);
        res.status(500).json({ error: error.message });
    }
});
```

- [ ] **Step 2: Add `/api/overview/orgs` endpoint**

Immediately after the block added in Step 1, insert:

```javascript
// ============================================
// OVERVIEW: Orgs with members and license data
// ============================================
app.get('/api/overview/orgs', async (req, res) => {
    try {
        const [
            { data: orgs,     error: orgsError },
            { data: licenses, error: licensesError },
            { data: members,  error: membersError },
            { data: profiles, error: profilesError }
        ] = await Promise.all([
            supabase.from('organizations').select('*').order('created_at', { ascending: false }),
            supabase.from('organization_licenses').select('*'),
            supabase.from('organization_members').select('*').neq('status', 'removed'),
            supabase.from('user_profiles').select('id, email, name')
        ]);

        if (orgsError) throw orgsError;

        const licenseMap = Object.fromEntries((licenses || []).map(l => [l.organization_id, l]));
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

        const membersByOrg = {};
        (members || []).forEach(m => {
            if (!membersByOrg[m.organization_id]) membersByOrg[m.organization_id] = [];
            const profile = profileMap[m.user_id] || {};
            membersByOrg[m.organization_id].push({
                user_id:               m.user_id,
                email:                 profile.email || m.email  || null,
                name:                  profile.name               || null,
                role:                  m.role,
                status:                m.status,
                has_license:           m.has_license,
                accepted_at:           m.accepted_at           || null,
                invited_at:            m.invited_at            || null,
                invite_token_hash:     m.invite_token_hash     || null,
                invitation_expires_at: m.invitation_expires_at || null
            });
        });

        // Sort members: admins first, then by accepted_at ascending
        Object.values(membersByOrg).forEach(list => {
            list.sort((a, b) => {
                if (a.role === 'admin' && b.role !== 'admin') return -1;
                if (a.role !== 'admin' && b.role === 'admin') return  1;
                return new Date(a.accepted_at || 0) - new Date(b.accepted_at || 0);
            });
        });

        const result = (orgs || []).map(org => {
            const lic         = licenseMap[org.id] || null;
            const ownerProfile = profileMap[org.owner_id] || {};
            const orgMembers  = membersByOrg[org.id] || [];

            return {
                id:                       org.id,
                name:                     org.name,
                owner_id:                 org.owner_id,
                owner_email:              ownerProfile.email          || null,
                is_trial:                 org.is_trial,
                is_personal_trial_org:    org.is_personal_trial_org,
                trial_expires_at:         org.trial_expires_at        || null,
                created_at:               org.created_at,
                total_licenses:           lic?.total_licenses         ?? null,
                used_licenses:            lic?.used_licenses          ?? null,
                license_type:             lic?.license_type           || null,
                license_expires_at:       lic?.expires_at             || null,
                paddle_id:                lic?.paddle_id              || null,
                subscription_id:          lic?.subscription_id        || null,
                grace_period_start:       lic?.grace_period_start     || null,
                grace_period_end:         lic?.grace_period_end       || null,
                scheduled_total_licenses: lic?.scheduled_total_licenses ?? null,
                scheduled_change_at:      lic?.scheduled_change_at    || null,
                member_count:             orgMembers.length,
                members:                  orgMembers
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error in /api/overview/orgs:', error);
        res.status(500).json({ error: error.message });
    }
});
```

- [ ] **Step 3: Verify endpoints**

Start the server:
```
npm start
```

In a separate terminal:
```
curl http://localhost:3000/api/overview/users
curl http://localhost:3000/api/overview/orgs
```

Expected: JSON arrays. Users array should have objects with `id`, `email`, `confirmed_at`, `org_id`, `pending_org_id` fields. Orgs array should have objects with `members` array nested inside. Both should return `200`.

Stop the server (`Ctrl+C`).

- [ ] **Step 4: Commit**

```bash
git add admin-server.js
git commit -m "feat: add /api/overview/users and /api/overview/orgs endpoints"
```

---

### Task 2: HTML + CSS — new admin shell

**Files:**
- Rewrite: `admin.html`
- Rewrite: `css/admin.css`

**Interfaces:**
- Produces DOM IDs consumed by Task 3 JS:
  - `#statsBar` — stats strip
  - `#searchInput` — search box
  - `#refreshBtn` — refresh button
  - `.adm-nav-btn[data-view]` — view toggle buttons
  - `#viewUsers` — users view container
  - `#viewOrgs` — orgs view container (hidden by default)

- [ ] **Step 1: Rewrite `admin.html`**

Replace the entire file with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — MepSketcher</title>
  <link rel="icon" type="image/svg+xml" href="images/favicon.svg">
  <link rel="stylesheet" href="css/admin.css">
</head>
<body>

  <header class="adm-header">
    <div class="adm-brand">MepSketcher <span class="adm-badge">ADMIN</span></div>
    <nav class="adm-nav">
      <button class="adm-nav-btn active" data-view="users">Users</button>
      <button class="adm-nav-btn" data-view="orgs">Organizations</button>
    </nav>
    <button class="adm-refresh-btn" id="refreshBtn">↻ Refresh</button>
  </header>

  <div class="adm-stats" id="statsBar">Loading stats...</div>

  <div class="adm-toolbar">
    <input type="text" class="adm-search" id="searchInput" placeholder="Search users, orgs, emails…">
  </div>

  <main class="adm-main">
    <div id="viewUsers"><p class="adm-empty">Loading…</p></div>
    <div id="viewOrgs" style="display:none"><p class="adm-empty">Loading…</p></div>
  </main>

  <script src="js/admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `css/admin.css`**

Replace the entire file with:

```css
:root {
  --bg:         #f0f4f8;
  --surface:    #ffffff;
  --border:     #e2e8f0;
  --text:       #1a202c;
  --muted:      #718096;
  --hdr-bg:     #1a202c;
  --stats-bg:   #2d3748;
  --stats-text: #e2e8f0;

  --green:      #276749; --green-bg:  #c6f6d5;
  --red:        #c53030; --red-bg:    #fed7d7;
  --yellow:     #744210; --yellow-bg: #fefcbf;
  --orange:     #7b341e; --orange-bg: #feebc8;
  --blue:       #2a4365; --blue-bg:   #bee3f8;
  --gray:       #4a5568; --gray-bg:   #e2e8f0;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

/* ── Header ────────────────────────────────────── */
.adm-header {
  background: var(--hdr-bg);
  color: #f7fafc;
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 52px;
  gap: 20px;
}
.adm-brand { font-weight: 700; font-size: 16px; }
.adm-badge {
  background: #e53e3e;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  margin-left: 8px;
  vertical-align: middle;
  letter-spacing: 0.05em;
}
.adm-nav { display: flex; gap: 4px; }
.adm-nav-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.65);
  padding: 6px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.adm-nav-btn:hover  { background: rgba(255,255,255,0.08); color: #fff; }
.adm-nav-btn.active { background: rgba(255,255,255,0.14); color: #fff; border-color: rgba(255,255,255,0.4); }
.adm-refresh-btn {
  margin-left: auto;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.25);
  color: rgba(255,255,255,0.75);
  padding: 5px 12px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.12s, color 0.12s;
}
.adm-refresh-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

/* ── Stats bar ─────────────────────────────────── */
.adm-stats {
  background: var(--stats-bg);
  color: var(--stats-text);
  padding: 10px 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  flex-wrap: wrap;
  min-height: 40px;
}
.stat-item  { white-space: nowrap; }
.stat-sep   { color: rgba(255,255,255,0.25); padding: 0 4px; }
.stat-warn  { color: #fc8181; }
.stat-broken {
  color: #fc8181;
  cursor: pointer;
  text-decoration: underline dotted;
}
.stat-broken:hover { color: #fff; }

/* ── Toolbar ───────────────────────────────────── */
.adm-toolbar {
  padding: 12px 24px 8px;
}
.adm-search {
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  width: 320px;
  background: var(--surface);
  color: var(--text);
}
.adm-search:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66,153,225,0.15);
}

/* ── Main ──────────────────────────────────────── */
.adm-main { padding: 8px 24px 48px; }

/* ── Users table ───────────────────────────────── */
.adm-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.adm-table th {
  background: #f7fafc;
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.adm-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.adm-table tbody tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover { background: #f7fafc; }

.cell-primary { font-weight: 500; }
.cell-muted   { color: var(--muted); font-size: 12px; }
.lic-yes      { color: var(--green); font-weight: 600; }
.lic-no       { color: var(--red);   font-weight: 600; }

/* ── Badges ────────────────────────────────────── */
.bdg {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: 0.03em;
}
.bdg-green  { background: var(--green-bg);  color: var(--green);  }
.bdg-red    { background: var(--red-bg);    color: var(--red);    }
.bdg-yellow { background: var(--yellow-bg); color: var(--yellow); }
.bdg-orange { background: var(--orange-bg); color: var(--orange); }
.bdg-blue   { background: var(--blue-bg);   color: var(--blue);   }
.bdg-gray   { background: var(--gray-bg);   color: var(--gray);   }

/* ── Org list ──────────────────────────────────── */
.org-list { display: flex; flex-direction: column; gap: 4px; }
.org-row {
  background: var(--surface);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  overflow: hidden;
}
.org-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  flex-wrap: wrap;
}
.org-header:hover { background: #f7fafc; }
.org-toggle  { color: var(--muted); font-size: 11px; flex-shrink: 0; width: 14px; }
.org-name    { font-weight: 600; }
.warn-icon   { color: #e53e3e; }
.org-expiry  { color: var(--muted); font-size: 12px; }
.org-scheduled { color: #b7791f; font-size: 12px; }
.org-meta    { margin-left: auto; display: flex; gap: 14px; align-items: center; flex-shrink: 0; }
.org-seats   { color: var(--muted); font-size: 13px; white-space: nowrap; }
.org-mcount  { color: var(--muted); font-size: 13px; white-space: nowrap; }

/* ── Member rows ───────────────────────────────── */
.org-members-list {
  border-top: 1px solid var(--border);
  background: #fafbfc;
  padding: 6px 16px 10px 16px;
}
.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
  flex-wrap: wrap;
}
.member-tree  { color: var(--muted); font-family: monospace; flex-shrink: 0; }
.member-email { font-weight: 500; }
.member-role  { font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
.role-admin   { color: #6b46c1; }
.role-member  { color: var(--muted); }
.member-join  { color: var(--muted); font-size: 12px; }

/* ── Misc ──────────────────────────────────────── */
.adm-empty { color: var(--muted); padding: 40px; text-align: center; }
.adm-error {
  color: var(--red);
  padding: 20px;
  background: var(--red-bg);
  border-radius: 8px;
  text-align: center;
}
.adm-count {
  color: var(--muted);
  font-size: 12px;
  margin-top: 10px;
  text-align: right;
}
```

- [ ] **Step 3: Verify structure loads**

Start the server (`npm start`), open `http://localhost:3000`.

Expected:
- Dark header with "MepSketcher ADMIN", "Users" and "Organizations" nav buttons, "↻ Refresh" button
- Dark stats bar showing "Loading stats..."
- Search box below stats bar
- "Loading…" text in the main area
- No JavaScript errors in browser console (the page won't be functional yet — that's normal for this task)

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add admin.html css/admin.css
git commit -m "feat: new admin HTML structure and CSS"
```

---

### Task 3: JS — complete admin.js rewrite

**Files:**
- Rewrite: `js/admin.js`

**Interfaces:**
- Consumes: DOM IDs from Task 2 (`#statsBar`, `#searchInput`, `#refreshBtn`, `.adm-nav-btn`, `#viewUsers`, `#viewOrgs`)
- Consumes: API endpoints from Task 1 (`/api/overview/users`, `/api/overview/orgs`)
- Exposes globally (for inline onclick): `window.toggleOrg(orgId)`

- [ ] **Step 1: Rewrite `js/admin.js`**

Replace the entire file with:

```javascript
// MepSketcher Admin Panel — Overview Dashboard

const STATE = {
    users: [],
    orgs: [],
    view: 'users',       // 'users' | 'orgs'
    search: '',
    expandedOrgs: new Set()
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function relTime(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 0) return 'future';
    const mins = Math.floor(diff / 60000);
    if (mins <  1)  return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30)  return `${days}d ago`;
    const mos = Math.floor(days / 30);
    if (mos  < 12)  return `${mos}mo ago`;
    return `${Math.floor(mos / 12)}y ago`;
}

function shortDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchAll() {
    renderLoading();
    try {
        const [uRes, oRes] = await Promise.all([
            fetch('/api/overview/users'),
            fetch('/api/overview/orgs')
        ]);
        if (!uRes.ok) throw new Error(`Users fetch failed (${uRes.status})`);
        if (!oRes.ok) throw new Error(`Orgs fetch failed (${oRes.status})`);
        STATE.users = await uRes.json();
        STATE.orgs  = await oRes.json();
    } catch (err) {
        renderError(err.message);
        return;
    }
    render();
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function computeStats() {
    const now = new Date();
    const { users, orgs } = STATE;

    const totalUsers     = users.length;
    const pendingSignups = users.filter(u => u.pending_org_id).length;
    const brokenUsers    = users.filter(u =>
        u.confirmed_at && !u.pending_org_id && !u.org_id
    ).length;

    const totalOrgs    = orgs.length;
    const paidOrgs     = orgs.filter(o =>
        (o.paddle_id || o.subscription_id) &&
        (!o.license_expires_at || new Date(o.license_expires_at) > now)
    ).length;
    const trialOrgs    = orgs.filter(o =>
        o.is_trial && (!o.trial_expires_at || new Date(o.trial_expires_at) > now) &&
        !o.paddle_id && !o.subscription_id
    ).length;
    const expiredTrials = orgs.filter(o =>
        o.is_trial &&
        o.trial_expires_at && new Date(o.trial_expires_at) <= now &&
        !o.paddle_id && !o.subscription_id
    ).length;
    const activeLicenses = orgs.reduce((s, o) => s + (o.used_licenses || 0), 0);

    return { totalUsers, pendingSignups, brokenUsers, totalOrgs, paidOrgs, trialOrgs, expiredTrials, activeLicenses };
}

function renderStats() {
    const s   = computeStats();
    const bar = document.getElementById('statsBar');
    const trialLabel = s.expiredTrials > 0
        ? `${s.trialOrgs} trial <span class="stat-warn">(${s.expiredTrials} expired)</span>`
        : `${s.trialOrgs} trial`;
    const brokenPart = s.brokenUsers > 0
        ? `<span class="stat-sep">·</span><span class="stat-broken" id="brokenFilter">${s.brokenUsers} broken ⚠</span>`
        : '';

    bar.innerHTML = `
        <span class="stat-item">${s.totalUsers} users</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.totalOrgs} orgs</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.paidOrgs} paid</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${trialLabel}</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.activeLicenses} active licenses</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.pendingSignups} pending signups</span>
        ${brokenPart}
    `;

    const brokenBtn = document.getElementById('brokenFilter');
    if (brokenBtn) {
        brokenBtn.addEventListener('click', () => {
            STATE.view   = 'users';
            STATE.search = '__broken__';
            document.getElementById('searchInput').value = '';
            updateNav();
            renderView();
        });
    }
}

// ─── Status / badge helpers ───────────────────────────────────────────────────

function getUserStatus(u) {
    if (u.pending_org_id)                       return { label: 'Pending',    cls: 'bdg-red'    };
    if (!u.confirmed_at)                        return { label: 'Unverified', cls: 'bdg-red'    };
    if (!u.org_id)                              return { label: 'No Org',     cls: 'bdg-yellow' };
    if (u.invite_token_hash && !u.accepted_at)  return { label: 'Invited',    cls: 'bdg-blue'   };
    if (u.has_license === false)                return { label: 'No License', cls: 'bdg-orange' };
    return                                             { label: 'Active',     cls: 'bdg-green'  };
}

function getOrgBadge(o) {
    const now    = new Date();
    const isPaid = !!(o.paddle_id || o.subscription_id);

    if (o.grace_period_end && new Date(o.grace_period_end) > now) {
        return { label: 'GRACE PERIOD', cls: 'bdg-orange' };
    }
    if (o.total_licenses == null) {
        return { label: 'NO LICENSE', cls: 'bdg-gray' };
    }
    if (isPaid) {
        if (!o.license_expires_at)                        return { label: 'PAID',    cls: 'bdg-green'  };
        const exp  = new Date(o.license_expires_at);
        if (exp < now)                                    return { label: 'EXPIRED', cls: 'bdg-red'    };
        const days = Math.ceil((exp - now) / 86400000);
        if (days <= 30) return { label: `EXPIRING (${days}d)`, cls: 'bdg-orange' };
        return { label: 'PAID', cls: 'bdg-green' };
    }
    // Trial
    if (!o.trial_expires_at)                              return { label: 'TRIAL',          cls: 'bdg-blue' };
    const tExp = new Date(o.trial_expires_at);
    if (tExp < now)                                       return { label: 'EXPIRED TRIAL',  cls: 'bdg-red'  };
    const days = Math.ceil((tExp - now) / 86400000);
    return { label: `TRIAL (${days}d)`, cls: 'bdg-blue' };
}

// ─── Users view ───────────────────────────────────────────────────────────────

function filterUsers() {
    const q = STATE.search.toLowerCase();
    if (!q)             return STATE.users;
    if (q === '__broken__') return STATE.users.filter(u =>
        u.confirmed_at && !u.pending_org_id && !u.org_id
    );
    return STATE.users.filter(u =>
        (u.email    || '').toLowerCase().includes(q) ||
        (u.name     || '').toLowerCase().includes(q) ||
        (u.org_name || '').toLowerCase().includes(q) ||
        (u.role     || '').toLowerCase().includes(q)
    );
}

function renderUsers() {
    const users     = filterUsers();
    const container = document.getElementById('viewUsers');

    if (!users.length) {
        container.innerHTML = '<p class="adm-empty">No users found.</p>';
        return;
    }

    const rows = users.map(u => {
        const status   = getUserStatus(u);
        const orgCell  = u.org_name
            ? esc(u.org_name)
            : u.pending_org_name
                ? `<span class="cell-muted">${esc(u.pending_org_name)} (pending)</span>`
                : '—';
        const licCell  = u.has_license === true
            ? '<span class="lic-yes">✓</span>'
            : u.has_license === false
                ? '<span class="lic-no">✗</span>'
                : '—';

        return `<tr>
            <td>
                <div class="cell-primary">${esc(u.name || '—')}</div>
                <div class="cell-muted">${esc(u.email || '—')}</div>
            </td>
            <td><span class="bdg ${status.cls}">${status.label}</span></td>
            <td>${orgCell}</td>
            <td>${u.role ? esc(u.role) : '—'}</td>
            <td>${licCell}</td>
            <td title="${esc(u.last_sign_in_at || '')}">${relTime(u.last_sign_in_at)}</td>
            <td title="${esc(u.signed_up_at || '')}">${relTime(u.signed_up_at)}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="adm-table">
            <thead><tr>
                <th>Name / Email</th>
                <th>Status</th>
                <th>Organization</th>
                <th>Role</th>
                <th>License</th>
                <th>Last Sign In</th>
                <th>Signed Up</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="adm-count">${users.length} user${users.length !== 1 ? 's' : ''}</div>
    `;
}

// ─── Orgs view ────────────────────────────────────────────────────────────────

function filterOrgs() {
    const q = STATE.search.toLowerCase();
    if (!q) return STATE.orgs;
    return STATE.orgs.filter(o =>
        (o.name        || '').toLowerCase().includes(q) ||
        (o.owner_email || '').toLowerCase().includes(q) ||
        (o.members || []).some(m =>
            (m.email || '').toLowerCase().includes(q) ||
            (m.name  || '').toLowerCase().includes(q)
        )
    );
}

function renderMemberRows(members) {
    if (!members || !members.length) {
        return '<div class="member-row"><span class="cell-muted">No members</span></div>';
    }
    return members.map((m, i) => {
        const isLast    = i === members.length - 1;
        const isPending = m.invite_token_hash && !m.accepted_at;
        const joinText  = m.accepted_at
            ? `joined ${shortDate(m.accepted_at)}`
            : m.invited_at
                ? `invited ${shortDate(m.invited_at)}`
                : '';
        const nameNote  = m.name ? ` <span class="cell-muted">(${esc(m.name)})</span>` : '';
        const licSpan   = m.has_license
            ? '<span class="lic-yes">✓ licensed</span>'
            : '<span class="lic-no">✗ no license</span>';

        return `<div class="member-row">
            <span class="member-tree">${isLast ? '└─' : '├─'}</span>
            <span class="member-email">${esc(m.email || '—')}${nameNote}</span>
            <span class="member-role ${m.role === 'admin' ? 'role-admin' : 'role-member'}">${esc(m.role)}</span>
            ${licSpan}
            ${joinText ? `<span class="member-join">${joinText}</span>` : ''}
            ${isPending ? '<span class="bdg bdg-blue">INVITE PENDING</span>' : ''}
        </div>`;
    }).join('');
}

function renderOrgs() {
    const orgs      = filterOrgs();
    const container = document.getElementById('viewOrgs');

    if (!orgs.length) {
        container.innerHTML = '<p class="adm-empty">No organizations found.</p>';
        return;
    }

    const items = orgs.map(o => {
        const badge      = getOrgBadge(o);
        const attention  = ['bdg-red', 'bdg-orange', 'bdg-gray'].includes(badge.cls);
        const expanded   = STATE.expandedOrgs.has(o.id);
        const seats      = o.total_licenses != null ? `${o.used_licenses || 0}/${o.total_licenses}` : '—';

        let expiryText = '';
        if (o.license_expires_at && (badge.label === 'PAID' || badge.label.startsWith('EXPIRING'))) {
            expiryText = `expires ${shortDate(o.license_expires_at)}`;
        } else if (o.license_expires_at && badge.label === 'EXPIRED') {
            expiryText = `expired ${shortDate(o.license_expires_at)}`;
        } else if (o.trial_expires_at && badge.label.startsWith('TRIAL')) {
            expiryText = `expires ${shortDate(o.trial_expires_at)}`;
        } else if (o.trial_expires_at && badge.label === 'EXPIRED TRIAL') {
            expiryText = `expired ${shortDate(o.trial_expires_at)}`;
        }

        const scheduledNote = o.scheduled_total_licenses != null
            ? `<span class="org-scheduled">→ ${o.scheduled_total_licenses} seats on ${shortDate(o.scheduled_change_at)}</span>`
            : '';

        const memberHtml = expanded ? renderMemberRows(o.members) : '';

        return `<div class="org-row${expanded ? ' org-expanded' : ''}" data-org-id="${esc(o.id)}">
            <div class="org-header" onclick="toggleOrg('${esc(o.id)}')">
                <span class="org-toggle">${expanded ? '▼' : '▶'}</span>
                <span class="org-name">${esc(o.name)}${attention ? ' <span class="warn-icon">⚠</span>' : ''}</span>
                <span class="bdg ${badge.cls}">${badge.label}</span>
                ${expiryText ? `<span class="org-expiry">${expiryText}</span>` : ''}
                ${scheduledNote}
                <span class="org-meta">
                    <span class="org-seats">${seats} seats</span>
                    <span class="org-mcount">${o.member_count} member${o.member_count !== 1 ? 's' : ''}</span>
                </span>
            </div>
            ${expanded ? `<div class="org-members-list">${memberHtml}</div>` : ''}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="org-list">${items}</div>
        <div class="adm-count">${orgs.length} org${orgs.length !== 1 ? 's' : ''}</div>
    `;
}

// Called from inline onclick — must be on window
window.toggleOrg = function(orgId) {
    if (STATE.expandedOrgs.has(orgId)) STATE.expandedOrgs.delete(orgId);
    else                               STATE.expandedOrgs.add(orgId);
    renderOrgs();
};

// ─── Rendering orchestration ──────────────────────────────────────────────────

function render() {
    renderStats();
    renderView();
}

function renderView() {
    const uEl = document.getElementById('viewUsers');
    const oEl = document.getElementById('viewOrgs');
    uEl.style.display = STATE.view === 'users' ? 'block' : 'none';
    oEl.style.display = STATE.view === 'orgs'  ? 'block' : 'none';
    if (STATE.view === 'users') renderUsers();
    else                        renderOrgs();
}

function renderLoading() {
    document.getElementById('viewUsers').innerHTML = '<p class="adm-empty">Loading…</p>';
    document.getElementById('viewOrgs').innerHTML  = '<p class="adm-empty">Loading…</p>';
    document.getElementById('statsBar').textContent = 'Loading stats…';
}

function renderError(msg) {
    const html = `<p class="adm-error">Error: ${esc(msg)}</p>`;
    document.getElementById('viewUsers').innerHTML = html;
    document.getElementById('viewOrgs').innerHTML  = html;
}

// ─── UI wire-up ───────────────────────────────────────────────────────────────

function updateNav() {
    document.querySelectorAll('.adm-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === STATE.view);
    });
}

function init() {
    document.querySelectorAll('.adm-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            STATE.view   = btn.dataset.view;
            STATE.search = '';
            document.getElementById('searchInput').value = '';
            updateNav();
            renderView();
        });
    });

    document.getElementById('searchInput').addEventListener('input', e => {
        STATE.search = e.target.value;
        renderView();
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        STATE.expandedOrgs.clear();
        document.getElementById('searchInput').value = '';
        STATE.search = '';
        fetchAll();
    });

    fetchAll();
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 2: Full smoke test**

Start the server (`npm start`), open `http://localhost:3000`.

Check **Users view** (default):
- Stats bar shows real counts: users · orgs · paid · trial · active licenses · pending signups
- If any broken users exist, stats bar shows "N broken ⚠" in red
- Users table shows rows with Name/Email column, colored status badges, org name, role, license ✓/✗, relative timestamps
- Status badge for Mitchell Roberts (`mitchell.roberts@beca.com`) should now show **No Org** (yellow) after his pending org was NOT yet processed, OR **Active** if you triggered the fix already — verify badge matches actual DB state

Check **Organizations view**:
- Click "Organizations" nav button → view switches
- Orgs appear as collapsed rows with badge (PAID / TRIAL / EXPIRED TRIAL / NO LICENSE) and seat count
- Click any org row → expands to show member list with tree connectors (├─ / └─)
- Admins listed first, role shown in purple, license shown as ✓/✗
- Pending invites show "INVITE PENDING" badge

Check **Search**:
- Type an email → Users view filters instantly
- Switch to Orgs view with text in search box → org rows filter by name, owner email, or member email

Check **Broken filter**:
- If stats bar shows broken count, click it → Users view filters to only broken-state users

Check **Refresh**:
- Click ↻ Refresh → data reloads, expanded orgs collapse

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat: complete admin dashboard redesign with users and orgs overview"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Users overview with status badges (Pending/No Org/Invited/No License/Active)
- ✅ Organization overview with expandable member list
- ✅ License type (PAID/TRIAL/EXPIRED/EXPIRING/GRACE PERIOD/NO LICENSE)
- ✅ Seat counts (used/total)
- ✅ License expiry dates
- ✅ Scheduled seat changes
- ✅ Stats bar with broken-state count and filter
- ✅ Pending invite badges on members
- ✅ Search filters both views
- ✅ Old endpoints preserved (not removed)
- ✅ Read-only (no write operations)

**Type consistency check:**
- `getUserStatus(u)` references: `u.pending_org_id`, `u.confirmed_at`, `u.org_id`, `u.invite_token_hash`, `u.accepted_at`, `u.has_license` — all present in `/api/overview/users` response shape ✅
- `getOrgBadge(o)` references: `o.grace_period_end`, `o.total_licenses`, `o.paddle_id`, `o.subscription_id`, `o.license_expires_at`, `o.trial_expires_at` — all present in `/api/overview/orgs` response shape ✅
- `computeStats()` references same fields — consistent ✅
- `window.toggleOrg` called from inline `onclick` — exported on window ✅
