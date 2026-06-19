# Admin Dashboard Redesign — Design Spec

**Date:** 2026-06-18  
**Status:** Approved  
**Scope:** Replace flat-table admin panel with relational insight dashboard (read-only)

---

## Problem

The existing `admin.html` shows each database table in isolation. Cross-table relationships (user → org → license) require manual cross-referencing. Broken states (e.g. user with no org after confirmed signup) are invisible at a glance.

---

## Goals

- See every user's status (pending / broken / active / no license / invited) in one row
- See every org's license type, seat utilization, and members in one expandable view
- Surface attention-needed states (broken users, expired trials, expiring licenses) prominently
- Read-only — no mutations from the panel

---

## Architecture

Keep existing stack: Express (`admin-server.js`) + static HTML/JS/CSS. Replace the UI entirely. Add two new joined-query API endpoints.

**Files changed:**
- `admin-server.js` — add 2 endpoints, keep existing ones
- `admin.html` — full rewrite
- `js/admin.js` — full rewrite
- `css/admin.css` — full rewrite

---

## API Endpoints

### `GET /api/overview/users`

Returns all users with joined org, license, and pending org data.

```sql
SELECT
  up.id, up.email, up.name,
  au.created_at AS signed_up_at,
  au.confirmed_at,
  au.last_sign_in_at,
  om.role, om.status AS member_status,
  om.has_license, om.accepted_at,
  om.invite_token_hash, om.invitation_expires_at,
  o.id AS org_id, o.name AS org_name, o.is_trial,
  ol.paddle_id, ol.subscription_id,
  ol.total_licenses, ol.used_licenses, ol.expires_at AS license_expires_at,
  po.id AS pending_org_id, po.organization_name AS pending_org_name
FROM user_profiles up
JOIN auth.users au ON au.id = up.id::uuid
LEFT JOIN organization_members om ON om.user_id = up.id AND om.status != 'removed'
LEFT JOIN organizations o ON o.id = om.organization_id
LEFT JOIN organization_licenses ol ON ol.organization_id = o.id
LEFT JOIN pending_organizations po ON po.user_id = up.id
ORDER BY au.created_at DESC
```

### `GET /api/overview/orgs`

Returns all orgs with aggregated member list and license data.

```sql
SELECT
  o.id, o.name, o.owner_id, o.is_trial, o.is_personal_trial_org,
  o.trial_expires_at, o.created_at,
  ol.total_licenses, ol.used_licenses, ol.license_type,
  ol.expires_at AS license_expires_at,
  ol.paddle_id, ol.subscription_id,
  ol.grace_period_start, ol.grace_period_end,
  ol.scheduled_total_licenses, ol.scheduled_change_at,
  up_owner.email AS owner_email,
  json_agg(json_build_object(
    'user_id', om.user_id,
    'email', COALESCE(up.email, om.email),
    'name', up.name,
    'role', om.role,
    'status', om.status,
    'has_license', om.has_license,
    'accepted_at', om.accepted_at,
    'invited_at', om.invited_at,
    'invite_token_hash', om.invite_token_hash,
    'invitation_expires_at', om.invitation_expires_at
  ) ORDER BY om.role DESC, om.accepted_at ASC) AS members
FROM organizations o
LEFT JOIN organization_licenses ol ON ol.organization_id = o.id
LEFT JOIN user_profiles up_owner ON up_owner.id = o.owner_id
LEFT JOIN organization_members om ON om.organization_id = o.id AND om.status != 'removed'
LEFT JOIN user_profiles up ON up.id = om.user_id
GROUP BY o.id, ol.total_licenses, ol.used_licenses, ol.license_type,
         ol.expires_at, ol.paddle_id, ol.subscription_id,
         ol.grace_period_start, ol.grace_period_end,
         ol.scheduled_total_licenses, ol.scheduled_change_at,
         up_owner.email
ORDER BY o.created_at DESC
```

---

## UI Layout

### Top bar
```
MepSketcher ADMIN                        [Users]  [Organizations]
```

### Stats bar (always visible)
```
18 users · 12 orgs · 4 paid · 7 trial (3 expired) · 9 active licenses · 2 pending signups · 1 broken ⚠
```
"Broken" = users with confirmed email, no org, no pending_org record. Clicking the ⚠ count filters the Users view to broken-state users only.

### Search + Refresh
Single search box filters the active view client-side. Refresh button re-fetches both endpoints.

---

## Users View

Table, one row per user. Columns:

| Column | Source | Notes |
|---|---|---|
| Name / Email | `user_profiles` | Stacked: bold name, muted email |
| Status badge | derived | See badge logic below |
| Organization | `organizations.name` | "—" if none |
| Role | `organization_members.role` | admin / member / "—" |
| License | `organization_members.has_license` | ✓ / ✗ / — |
| Last Sign In | `auth.users.last_sign_in_at` | relative time (e.g. "2h ago") |
| Signed Up | `auth.users.created_at` | relative time |

**Status badge logic (evaluated in order):**

| Badge | Color | Condition |
|---|---|---|
| Pending | 🔴 red | `pending_organizations` row exists |
| No Org | 🟡 yellow | confirmed, no pending, no org_member |
| Invited | 🔵 blue | org_member with `invite_token_hash` set and `accepted_at` null |
| No License | 🟠 orange | org_member, `has_license = false` |
| Active | 🟢 green | org_member, `has_license = true` |

---

## Organizations View

Expandable list. Each org is one collapsed row; click to expand members.

### Collapsed row columns:

| Column | Source |
|---|---|
| Org name | `organizations.name` |
| License badge | derived (see below) |
| Expiry / days left | `license_expires_at` or `trial_expires_at` |
| Seats | `used_licenses / total_licenses` (hidden if no license row) |
| Members | count of non-removed members |
| ⚠ indicator | any attention-needed state |

**License badge logic:**

| Badge | Condition |
|---|---|
| PAID | has `paddle_id` or `subscription_id` and `expires_at` > now |
| EXPIRING | PAID, `expires_at` within 30 days |
| EXPIRED | PAID, `expires_at` < now |
| GRACE PERIOD | `grace_period_end` set and in future |
| TRIAL | `is_trial = true`, no paddle_id, `trial_expires_at` > now — shows days remaining |
| EXPIRED TRIAL | `is_trial = true`, `trial_expires_at` < now |
| NO LICENSE | no `organization_licenses` row |

Scheduled change note shown inline if `scheduled_total_licenses` is set: e.g. "→ 5 seats on 2026-07-01".

### Expanded member list:

```
▼  Acme Corp   [PAID]  expires 2027-02-04   3/11 seats   2 members
   ├─ john@acme.com     admin    ✓ licensed    joined 2026-02-04
   ├─ jane@acme.com     member   ✓ licensed    joined 2026-02-17
   └─ bob@acme.com      member   ✗ no license  invited 2026-03-01  [INVITE PENDING]
```

Member rows show: email, name (if available), role, license status, joined/invited date, invite-pending tag.

---

## Stats Bar Counts

Derived client-side from the two API responses:

- **users** — total user_profiles rows
- **orgs** — total organizations rows
- **paid** — orgs with paddle_id or subscription_id and expires_at > now
- **trial (N expired)** — orgs with is_trial=true; expired subset in parens
- **active licenses** — sum of used_licenses across all org_licenses rows
- **pending signups** — pending_organizations rows
- **broken ⚠** — users confirmed, no org_member, no pending_org

---

## Existing Endpoints Kept

`admin-server.js` existing `/api/*` table endpoints are kept intact so the old tab views remain accessible as a fallback (no removal needed, just hidden from primary nav).

---

## Out of Scope

- Write/mutation actions (add later if needed)
- Email sending from the panel
- Pagination (client-side filtering is sufficient at current data volumes)
- Authentication on the local server (local-only, no auth required per existing design)
