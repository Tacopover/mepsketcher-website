# Quick Fix: Manually Trigger JWT Claims

## Problem

The `organization_members` table doesn't have an `updated_at` column.

## Solution

Use one of these queries to manually trigger the JWT claims:

### Option 1: Simple Update (Recommended)

```sql
-- Replace 'your-email@example.com' with your actual email
UPDATE organization_members
SET status = 'active'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com')
  AND status = 'active';
```

### Option 2: Update Timestamp

```sql
-- Updates the accepted_at timestamp (which does exist)
UPDATE organization_members
SET accepted_at = NOW()
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com')
  AND status = 'active';
```

## Verification

### 1. Check if trigger fired (SQL Editor)

```sql
-- Check your raw_app_meta_data
SELECT
  u.id,
  u.email,
  u.raw_app_meta_data
FROM auth.users u
WHERE u.email = 'your-email@example.com';
```

**Expected result:**

```json
{
  "org_id": "your-organization-uuid",
  "org_role": "admin"
}
```

### 2. Refresh your session (Browser Console)

```javascript
// Refresh to get new JWT with claims
await supabase.auth.refreshSession();

// Check claims
const {
  data: { session },
} = await supabase.auth.getSession();
console.log("app_metadata:", session.user.app_metadata);
// Should show: { org_id: '...', org_role: '...' }
```

### 3. Run tests (Browser Console or Test Page)

```javascript
import { JWTClaimsTester } from "./js/test-jwt-claims.js";
const tester = new JWTClaimsTester(supabase);
await tester.runAllTests();
```

## Still Not Working?

### Check Trigger Exists

```sql
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_member_added_set_claims';
```

Should return 1 row showing the trigger on `organization_members`.

### Check Function Exists

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'set_user_org_claims_auto'
  AND routine_schema = 'public';
```

Should return 1 row.

### Check Membership Status

```sql
SELECT
  om.user_id,
  om.organization_id,
  om.role,
  om.status,
  u.email
FROM organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE u.email = 'your-email@example.com';
```

Verify:

- ✅ `status = 'active'`
- ✅ `user_id` is not null
- ✅ `organization_id` is not null
- ✅ `role` is set ('admin' or 'member')

### Manual Trigger (If All Else Fails)

```sql
-- Directly update auth.users (requires admin privileges)
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data ||
  jsonb_build_object(
    'org_id', (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com')
        AND status = 'active'
      LIMIT 1
    ),
    'org_role', (
      SELECT role
      FROM organization_members
      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com')
        AND status = 'active'
      LIMIT 1
    )
  )
WHERE email = 'your-email@example.com';
```

## Success!

Once claims appear in `raw_app_meta_data` and you've refreshed your session, all tests should pass. ✅
