# Edge Function Implementation - Quick Reference

## ✅ What Was Implemented

### New Files

- **`supabase/functions/set-org-claims/index.ts`** - Edge Function that sets JWT claims
- **`docs/EDGE_FUNCTION_DEPLOYMENT.md`** - Deployment guide

### Modified Files

- **`js/jwt-claims-helper.js`** - Updated to use Edge Function instead of triggers
- **`js/test-jwt-claims.js`** - Added Edge Function test
- **`test-jwt-claims.html`** - Added Edge Function test button

---

## 🚀 Quick Start

### 1. Deploy Edge Function

**Using Supabase CLI:**

```bash
# Install CLI if needed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project (find ref in Dashboard > Settings > General)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy function
supabase functions deploy set-org-claims
```

**Using Supabase Dashboard:**

1. Go to **Edge Functions** → **Create new function**
2. Name: `set-org-claims`
3. Paste code from `supabase/functions/set-org-claims/index.ts`
4. Click **Deploy**

### 2. Test It Works

**Browser Console:**

```javascript
// Call Edge Function
import { JWTClaimsHelper } from "./js/jwt-claims-helper.js";
const helper = new JWTClaimsHelper(supabase);
const result = await helper.setOrgClaims();
console.log(result);

// Should return:
// { success: true, org_id: "...", org_role: "...", claims: {...} }
```

**Or use Test Page:**

- Open `test-jwt-claims.html`
- Click **"5. Call Edge Function"**
- Check for ✅ success message

### 3. Verify Claims

**SQL Query:**

```sql
SELECT email, raw_app_meta_data
FROM auth.users
WHERE email = 'your-email@example.com';
```

**Browser Console:**

```javascript
await supabase.auth.refreshSession();
const {
  data: { session },
} = await supabase.auth.getSession();
console.log(session.user.app_metadata);
// Should show: { org_id: '...', org_role: '...' }
```

---

## 🎯 How It Works

### Old Approach (Database Trigger)

❌ Hard to debug  
❌ Permission issues  
❌ Silent failures  
❌ Difficult to test

### New Approach (Edge Function)

✅ **Explicit call** from client code  
✅ **Full logging** in Supabase Dashboard  
✅ **Service role** privileges (can modify auth.users)  
✅ **Easy to test** via HTTP or browser

### Flow:

```
1. User logs in
2. App calls jwtHelper.ensureClaimsPresent()
3. Helper checks if claims exist in JWT
4. If missing → calls Edge Function
5. Edge Function:
   - Gets user's active membership
   - Updates auth.users.raw_app_meta_data
   - Returns success
6. Helper refreshes session
7. JWT now contains org_id and org_role
```

---

## 📝 Code Examples

### Manual Call (Testing)

```javascript
const helper = new JWTClaimsHelper(supabase);

// Set claims explicitly
const result = await helper.setOrgClaims();
if (result.success) {
  console.log("Claims set:", result.claims);
}
```

### Automatic (In App Initialization)

```javascript
// Already implemented in members-manager.js
const jwtHelper = new JWTClaimsHelper(supabase);

// This automatically calls Edge Function if claims missing
const result = await jwtHelper.ensureClaimsPresent();

if (!result.success) {
  console.error("Failed to set claims:", result.error);
}
```

### Check Current Claims

```javascript
const helper = new JWTClaimsHelper(supabase);
const claims = await helper.getOrgClaims();

if (claims) {
  console.log("Org ID:", claims.org_id);
  console.log("Role:", claims.org_role);
} else {
  console.log("No claims found");
}
```

---

## 🧪 Testing Checklist

- [ ] Edge Function deploys successfully
- [ ] Function appears in Supabase Dashboard
- [ ] Test curl command returns success
- [ ] Browser test returns success
- [ ] `raw_app_meta_data` updated in database
- [ ] Session refresh shows claims in JWT
- [ ] Test page shows all tests passing
- [ ] App initialization sets claims automatically

---

## 🔧 Troubleshooting

### "Function not found"

```bash
# Verify deployment
supabase functions list

# Redeploy if needed
supabase functions deploy set-org-claims
```

### "No active membership found"

```sql
-- Check your membership
SELECT * FROM organization_members
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');

-- Ensure status = 'active'
```

### Claims not in JWT after call

```javascript
// Must refresh session!
await supabase.auth.refreshSession();

// Then check
const {
  data: { session },
} = await supabase.auth.getSession();
console.log(session.user.app_metadata);
```

### View Edge Function logs

```bash
# Real-time logs
supabase functions logs set-org-claims --follow

# Or in Dashboard: Edge Functions > set-org-claims > Logs
```

---

## 📚 Documentation

- **Full Deployment Guide:** `docs/EDGE_FUNCTION_DEPLOYMENT.md`
- **Testing Guide:** `docs/JWT_CLAIMS_TESTING_GUIDE.md`
- **Quick Fix Guide:** `docs/QUICK_FIX_JWT_CLAIMS.md`

---

## ✅ Success Criteria

Once these all pass, tell Supabase agent to update RLS policy:

✅ Edge Function deployed  
✅ Function callable from browser  
✅ Claims appear in `raw_app_meta_data`  
✅ Session refresh shows claims in JWT  
✅ All tests in test page pass  
✅ App initialization works automatically

---

## 🎉 Next Steps

1. Deploy Edge Function (see above)
2. Test it works (browser console or test page)
3. Verify claims in database and JWT
4. Tell Supabase agent to apply RLS policy:

> "The Edge Function is working and setting JWT claims correctly. Please use **Option 2** (`app_metadata.org_id` and `app_metadata.org_role`) and apply the RLS policy update."

RLS Policy they'll apply:

```sql
ALTER POLICY "Org members can select organization_members"
ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid
  );
```
