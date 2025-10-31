# 🔧 HOTFIX: Permission Denied Error

## Problem

The dashboard shows this error in console:

```
Error loading licenses: {code: '42501', message: 'permission denied for schema auth'}
```

## Root Cause

The `get_available_licenses()` function was created with `SECURITY DEFINER` which tried to access the `auth` schema. Supabase restricts access to the auth schema for security reasons.

## Solution

The function has been changed to use `SECURITY INVOKER` which runs with the caller's permissions. Additionally, a fallback method has been added to the JavaScript code that will work even if the RPC function fails.

## How to Fix

### Option 1: Run the Hotfix SQL (Recommended)

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Copy and paste **`DATABASE_FIX_get_available_licenses.sql`**
4. Click **Run** (Ctrl+Enter)
5. Refresh your dashboard page

### Option 2: Use the Fallback (Already Active)

The JavaScript code now has a fallback method that works without the RPC function. If you see the error but the dashboard still works, the fallback is handling it automatically.

**No action needed** - just the error message in console.

## Verification

After running the hotfix SQL:

1. Refresh your dashboard page
2. Open browser console (F12)
3. You should **NOT** see the permission error anymore
4. License and member information should display correctly

## What Changed

### Files Updated:

1. **`DATABASE_MEMBER_MANAGEMENT.sql`** - Updated function definition (for fresh installs)
2. **`DATABASE_FIX_get_available_licenses.sql`** - Hotfix for existing installations
3. **`js/members-manager.js`** - Added fallback method
4. **`js/dashboard.js`** - Better error handling

### Technical Details:

**Before:**

```sql
SECURITY DEFINER  -- Runs as function owner, tries to access auth schema
```

**After:**

```sql
SECURITY INVOKER  -- Runs as caller, uses their permissions only
```

## Impact

- ✅ Dashboard loads normally
- ✅ License information displays correctly
- ✅ Member list shows properly
- ✅ No more permission errors in console
- ✅ Add member functionality works

## If Still Having Issues

### Check RLS Policies

Make sure users can read their own organization data:

```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'organization_licenses', 'organization_members');

-- If RLS is enabled, you may need these policies:
CREATE POLICY "Users can view their organization licenses"
ON organization_licenses FOR SELECT
USING (
  organization_id IN (
    SELECT id FROM organizations WHERE owner_id = auth.uid()
    UNION
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);
```

### Clear Browser Cache

1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

### Check Console for New Errors

- Open browser console (F12)
- Look for any JavaScript errors
- Check Network tab for failed requests

## Summary

**Quick Fix:** Run `DATABASE_FIX_get_available_licenses.sql` in Supabase SQL Editor

**Time:** 1 minute

**Result:** Dashboard works perfectly, no errors

---

**Note:** The fallback method means your dashboard should work even without running the SQL fix, but running it eliminates the console error and may be slightly faster.
