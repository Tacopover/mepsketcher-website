# JWT Claims Implementation - Testing Guide

## Overview

This guide will help you verify that the JWT claims implementation is working correctly. The database triggers should automatically set `org_id` and `org_role` in the JWT `app_metadata` when a user becomes an active member of an organization.

## Prerequisites

- Database triggers are installed (you mentioned you ran the script ✅)
- You have access to the Supabase SQL Editor
- You have a user account that is a member of an organization

---

## Phase 1: Verify Database Triggers Exist

### Step 1.1: Check Triggers in Supabase SQL Editor

Run this SQL query to verify the triggers were created:

```sql
-- Check if triggers exist
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name IN (
  'on_member_added_set_claims',
  'on_member_removed_clear_claims'
);
```

**Expected Result:**

- Should return 2 rows showing both triggers
- `on_member_added_set_claims` should be on INSERT OR UPDATE
- `on_member_removed_clear_claims` should be on UPDATE

### Step 1.2: Check Functions Exist

```sql
-- Check if functions exist
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'set_user_org_claims_auto',
  'clear_user_org_claims_auto'
)
AND routine_schema = 'public';
```

**Expected Result:**

- Should return 2 rows showing both functions as type 'FUNCTION'

---

## Phase 2: Test with Existing User

### Step 2.1: Check Current JWT Claims (Browser Console)

1. **Open your application** in a browser and log in
2. **Open Developer Console** (F12)
3. **Run this code:**

```javascript
// Get current session
const {
  data: { session },
} = await supabase.auth.getSession();

// Check app_metadata
console.log("Current app_metadata:", session.user.app_metadata);

// Look for org_id and org_role
if (session.user.app_metadata?.org_id) {
  console.log("✅ org_id found:", session.user.app_metadata.org_id);
} else {
  console.log("❌ org_id NOT found");
}

if (session.user.app_metadata?.org_role) {
  console.log("✅ org_role found:", session.user.app_metadata.org_role);
} else {
  console.log("❌ org_role NOT found");
}
```

**If claims are NOT found:** Continue to Step 2.2
**If claims ARE found:** Skip to Phase 3

### Step 2.2: Trigger Claims Update (If Missing)

If claims are missing, we need to trigger the database function by updating the membership status:

**In Supabase SQL Editor:**

```sql
-- Replace with your actual email
-- First, check your current membership:
SELECT
  om.id,
  om.user_id,
  om.organization_id,
  om.role,
  om.status,
  u.email
FROM organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE u.email = 'your-email@example.com';

-- Now trigger the claims update by re-setting status to active
UPDATE organization_members
SET status = 'active'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com')
  AND status = 'active';
```

This will trigger `on_member_added_set_claims` even though status didn't change.

### Step 2.3: Refresh Session and Check Again

**Back in Browser Console:**

```javascript
// Refresh session to get updated JWT
await supabase.auth.refreshSession();

// Check again
const {
  data: { session },
} = await supabase.auth.getSession();
console.log("Updated app_metadata:", session.user.app_metadata);

// Should now show org_id and org_role
```

---

## Phase 3: Verify Claims with Helper Module

### Step 3.1: Use JWTClaimsHelper

**In Browser Console:**

```javascript
// Import and create helper
import { JWTClaimsHelper } from "./js/jwt-claims-helper.js";
const helper = new JWTClaimsHelper(supabase);

// Test 1: Get current claims
const claims = await helper.getOrgClaims();
console.log("Claims:", claims);
// Expected: { org_id: '...', org_role: '...', valid: true }

// Test 2: Debug full JWT
await helper.debugJWT();
// Should show User ID, Email, and app_metadata with org_id and org_role

// Test 3: Ensure claims (with auto-refresh if needed)
const result = await helper.ensureClaimsPresent();
console.log("Ensure result:", result);
// Expected: { success: true, claims: {...}, refreshed: false }
```

### Step 3.2: Use Automated Test Suite

**In Browser Console:**

```javascript
// Import test utilities
import { JWTClaimsTester } from "./js/test-jwt-claims.js";
const tester = new JWTClaimsTester(supabase);

// Run all automated tests
await tester.runAllTests();

// Or run individual tests:
await tester.testClaimsPresent();
await tester.testJWTStructure();
await tester.testEnsureClaims();
await tester.testDatabaseMembership();
```

**Expected Output:**

```
🚀 Running All JWT Claims Tests

🔍 Test 1: Check JWT Claims Present
✅ PASS: JWT claims are present
   org_id: abc123...
   org_role: admin

🔍 Test 2: Check JWT Structure
✅ PASS: app_metadata contains org claims

🔍 Test 3: Ensure Claims Present
✅ PASS: Claims ensured successfully
   ℹ️  Claims were already present
   Claims: { org_id: '...', org_role: '...' }

🔍 Test 4: Check Database Membership
✅ PASS: Found active membership(s)
✅ Claims match first membership

✅ All tests completed
```

---

## Phase 4: Test Trigger on New Member

### Step 4.1: Invite a Test User

Use your application's invite functionality:

```javascript
// In browser console (assuming membersManager is initialized)
const result = await window.membersManager.inviteMember(
  "test@example.com",
  "member"
);
console.log(result);
```

### Step 4.2: Accept Invitation (If Testing with New User)

If you're testing with a new account:

1. Sign up with the invited email
2. Accept the invitation
3. **The trigger should automatically set JWT claims**

### Step 4.3: Verify Claims Were Set

After the new user logs in, run in their browser console:

```javascript
const {
  data: { session },
} = await supabase.auth.getSession();
console.log("New user app_metadata:", session.user.app_metadata);

// Should show org_id and org_role immediately after signup/activation
```

---

## Phase 5: Test with SQL Direct Query

### Step 5.1: Verify Claims in Database

**In Supabase SQL Editor (as authenticated user):**

```sql
-- Get your own JWT claims from the database
SELECT
  id,
  email,
  raw_app_meta_data
FROM auth.users
WHERE id = auth.uid(); -- Gets current authenticated user

-- Check if org_id and org_role are present in raw_app_meta_data
```

**Expected Result:**

```json
{
  "org_id": "your-organization-uuid",
  "org_role": "admin"
}
```

### Step 5.2: Test RLS Policy Using JWT Claims

Once the Supabase agent updates the RLS policy to use JWT claims, test it:

```sql
-- This query should now use JWT claims instead of explicit filter
SELECT * FROM organization_members;

-- Should only return members from YOUR organization (from JWT org_id claim)
-- No need to filter by organization_id - RLS does it automatically
```

---

## Troubleshooting

### Issue 1: Claims Not Appearing After Trigger Update

**Solution:**

```javascript
// Force session refresh
await supabase.auth.refreshSession();

// Wait a moment
await new Promise((resolve) => setTimeout(resolve, 1000));

// Check again
const {
  data: { session },
} = await supabase.auth.getSession();
console.log(session.user.app_metadata);
```

### Issue 2: Trigger Not Firing

**Check trigger execution in Supabase logs:**

1. Go to Supabase Dashboard
2. Navigate to Database → Triggers
3. Check if trigger exists and is enabled

**Manually execute trigger function:**

```sql
-- Test the function directly
SELECT set_user_org_claims_auto()
FROM organization_members
WHERE user_id = 'YOUR-USER-ID'
  AND status = 'active'
LIMIT 1;
```

### Issue 3: Claims Mismatch

**Verify organization membership:**

```sql
SELECT
  om.user_id,
  om.organization_id,
  om.role,
  om.status,
  u.raw_app_meta_data->>'org_id' as jwt_org_id,
  u.raw_app_meta_data->>'org_role' as jwt_org_role
FROM organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE om.user_id = 'YOUR-USER-ID';

-- Check if jwt_org_id matches organization_id
-- Check if jwt_org_role matches role
```

---

## Success Criteria

✅ **Claims are present** in `session.user.app_metadata`
✅ **Claims contain** `org_id` and `org_role`
✅ **Claims match** user's active organization membership
✅ **Triggers fire** when adding new members
✅ **Session refresh** updates JWT with new claims
✅ **Helper functions** work correctly
✅ **All automated tests** pass

---

## Next Steps After Testing

Once all tests pass:

1. ✅ **Tell Supabase agent to update RLS policy:**
   - Use **Option 2**: `app_metadata.org_id` and `app_metadata.org_role`
2. ✅ **Test RLS policy** works with JWT claims

3. ✅ **Update application code** to remove explicit `organization_id` filters where RLS handles it

4. ✅ **Test in production** with real users

---

## Quick Test Checklist

- [ ] Database triggers exist
- [ ] Database functions exist
- [ ] JWT contains `app_metadata.org_id`
- [ ] JWT contains `app_metadata.org_role`
- [ ] Claims match database membership
- [ ] Helper `getOrgClaims()` works
- [ ] Helper `ensureClaimsPresent()` works
- [ ] Helper `debugJWT()` shows claims
- [ ] All automated tests pass
- [ ] New member trigger sets claims
- [ ] Session refresh updates claims

---

## Support

If you encounter issues:

1. Check Supabase Database logs for trigger errors
2. Verify user is actually an active member
3. Try manually refreshing session
4. Check if triggers are enabled
5. Verify function permissions (SECURITY DEFINER is set)
