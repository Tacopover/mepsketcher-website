# Edge Function Deployment Guide

## Overview

The `set-org-claims` Edge Function sets organization context (org_id and org_role) in the user's JWT app_metadata.

## Prerequisites

- Supabase CLI installed: `npm install -g supabase`
- Logged in to Supabase: `supabase login`

## Deployment Steps

### Option 1: Using Supabase CLI (Recommended)

#### 1. Link to your Supabase project

```bash
# From the mepsketcher-website directory
supabase link --project-ref YOUR_PROJECT_REF

# Find your project ref in: Supabase Dashboard > Settings > General > Reference ID
```

#### 2. Deploy the function

```bash
supabase functions deploy set-org-claims
```

#### 3. Verify deployment

```bash
# List all deployed functions
supabase functions list

# Should show: set-org-claims
```

### Option 2: Using Supabase Dashboard

#### 1. Navigate to Edge Functions

- Go to your Supabase Dashboard
- Click **Edge Functions** in the left sidebar
- Click **Create a new function**

#### 2. Create function

- **Name:** `set-org-claims`
- **Code:** Copy contents from `supabase/functions/set-org-claims/index.ts`
- Click **Deploy**

## Testing the Edge Function

### Test 1: Using curl

```bash
# Get your access token first (run in browser console):
# const { data: { session } } = await supabase.auth.getSession();
# console.log(session.access_token);

# Replace YOUR_PROJECT_REF and YOUR_ACCESS_TOKEN
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/set-org-claims' \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**

```json
{
  "success": true,
  "org_id": "abc-123-...",
  "org_role": "admin",
  "message": "Claims updated successfully. Please refresh your session."
}
```

### Test 2: Using Browser Console

```javascript
// After logging in to your app
const { data, error } = await supabase.functions.invoke("set-org-claims", {
  body: {},
});

console.log("Response:", data);
console.log("Error:", error);
```

### Test 3: Using Test Page

1. Open `test-jwt-claims.html` in browser
2. Ensure you're logged in
3. Click **"5. Call Edge Function"**
4. Check output console for results

## Verifying Claims Were Set

### Method 1: SQL Query

```sql
-- In Supabase SQL Editor
SELECT
  id,
  email,
  raw_app_meta_data
FROM auth.users
WHERE email = 'your-email@example.com';
```

Should show:

```json
{
  "org_id": "your-org-uuid",
  "org_role": "admin"
}
```

### Method 2: Browser Console

```javascript
// Refresh session to get new JWT
await supabase.auth.refreshSession();

// Check claims
const {
  data: { session },
} = await supabase.auth.getSession();
console.log("app_metadata:", session.user.app_metadata);
// Should show: { org_id: '...', org_role: '...' }
```

## Troubleshooting

### Error: "Function not found"

- Verify function is deployed: `supabase functions list`
- Check function name is exactly `set-org-claims`
- Try redeploying: `supabase functions deploy set-org-claims`

### Error: "Unauthorized"

- Ensure you're logged in
- Check that JWT token is valid
- Verify Authorization header is set correctly

### Error: "No active organization membership found"

- User must have an active membership in `organization_members` table
- Check: `SELECT * FROM organization_members WHERE user_id = 'your-user-id' AND status = 'active'`
- Status must be exactly `'active'` (not null, not 'pending')

### Error: "Failed to update user metadata"

- Check Supabase logs: Dashboard > Edge Functions > set-org-claims > Logs
- Verify `SUPABASE_SERVICE_ROLE_KEY` environment variable is set
- Service role key should have admin privileges

### Claims not appearing in JWT

- You must refresh the session after calling the Edge Function
- Run: `await supabase.auth.refreshSession()`
- Then check: `const { data: { session } } = await supabase.auth.getSession()`

## Viewing Logs

### Via Supabase Dashboard

1. Go to **Edge Functions**
2. Click **set-org-claims**
3. Click **Logs** tab
4. View real-time execution logs

### Via CLI

```bash
# Stream logs in real-time
supabase functions logs set-org-claims --follow
```

## Environment Variables

The function automatically has access to:

- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (admin privileges)

These are set automatically by Supabase.

## Updating the Function

### After making changes to `index.ts`:

```bash
# Redeploy
supabase functions deploy set-org-claims

# Verify update
supabase functions list
```

## Integration with App

The function is automatically called by `JWTClaimsHelper.ensureClaimsPresent()`:

```javascript
// In your app initialization
import { JWTClaimsHelper } from "./js/jwt-claims-helper.js";

const jwtHelper = new JWTClaimsHelper(supabase);
const result = await jwtHelper.ensureClaimsPresent();

if (!result.success) {
  console.error("Failed to set claims:", result.error);
  // Handle error - maybe show message to user
}
```

## Success Indicators

✅ Function deploys without errors  
✅ Function appears in `supabase functions list`  
✅ Test curl returns success response  
✅ `raw_app_meta_data` updated in database  
✅ JWT contains `org_id` and `org_role` after session refresh  
✅ All tests in `test-jwt-claims.html` pass

## Next Steps

After successful deployment:

1. ✅ Test function directly via curl
2. ✅ Test via browser console
3. ✅ Run automated tests in `test-jwt-claims.html`
4. ✅ Verify claims appear in JWT
5. ✅ Tell Supabase agent to update RLS policy
