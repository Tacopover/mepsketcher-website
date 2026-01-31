# Edge Functions Updated - Summary

All three edge functions have been updated to support the trial flow! ✅

---

## Changes Made

### 1. ✅ signup/index.ts

**Change**: Added `user_id` to pending_organizations insert

**Line modified**: ~260

**What it does**: Now stores the user_id when creating pending organization entries, making it easier to look them up later.

---

### 2. ✅ signin/index.ts

**Changes**:

1. Updated `SignInResponse` interface to include organization info
2. Added trial fields (`is_trial`, `trial_expires_at`) when creating organization
3. Query organization info and return trial status in response

**Lines modified**: ~14 (interface), ~174 (org creation), ~252 (response)

**What it does**:

- When processing pending organizations and creating a new org, it now sets `is_trial: true` and `trial_expires_at` to 14 days from now
- Returns organization details including trial status, expiry date, and days remaining
- Frontend can now display trial banner based on this info

---

### 3. ✅ paddle-webhook/index.ts

**Changes**:

1. Accepts `organization_id` from custom_data (for existing trial users)
2. Sets `used_licenses: 1` instead of 0 (owner already exists)
3. Updates `organizations.is_trial` to false after license creation

**Lines modified**: ~70 (custom_data parsing), ~178 (used_licenses), ~194 (trial update)

**What it does**:

- Now expects `organization_id` in Paddle custom_data (from trial users upgrading)
- Correctly sets used_licenses to 1 since the owner already exists in organization_members
- Marks the organization as no longer in trial mode after successful payment

---

## Testing the Updates

### Test 1: Signup Flow

```bash
# Sign up a new user
# Check that pending_organizations has user_id populated
```

**SQL to verify**:

```sql
SELECT user_id, user_email, organization_name
FROM pending_organizations
WHERE user_id IS NOT NULL;
```

### Test 2: First Login (Trial Creation)

```bash
# Login with confirmed email
# Should create organization with trial
```

**SQL to verify**:

```sql
SELECT id, name, owner_id, is_trial, trial_expires_at
FROM organizations
WHERE is_trial = true
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**: Trial expires at should be ~14 days from now

### Test 3: Signin Response

Check the signin response includes organization info:

```json
{
  "success": true,
  "user": {...},
  "organization": {
    "id": "...",
    "name": "...",
    "isTrial": true,
    "trialExpiresAt": "2025-11-01T...",
    "daysRemaining": 14
  }
}
```

### Test 4: Payment Flow

```bash
# Complete Paddle payment with custom_data containing:
# - user_id
# - organization_id
# - email
```

**SQL to verify license creation**:

```sql
SELECT
  ol.organization_id,
  ol.total_licenses,
  ol.used_licenses,
  ol.license_type,
  ol.expires_at,
  o.is_trial
FROM organization_licenses ol
JOIN organizations o ON o.id = ol.organization_id
WHERE ol.organization_id = 'YOUR_ORG_ID';
```

**Expected**:

- `total_licenses` = quantity purchased
- `used_licenses` = 1
- `is_trial` = false

---

## Deployment Steps

### 1. Test Locally (Recommended)

```bash
# Start local Supabase functions
supabase functions serve

# Test signup
curl -X POST http://localhost:54321/functions/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User","organizationName":"Test Org"}'

# Test signin
curl -X POST http://localhost:54321/functions/v1/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 2. Deploy to Supabase

```bash
# Deploy all three functions
supabase functions deploy signup
supabase functions deploy signin
supabase functions deploy paddle-webhook

# Or deploy all at once
supabase functions deploy
```

### 3. Verify Deployment

```bash
# Test production endpoints
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/signup \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

---

## Next Steps

Now that edge functions are updated, you can move to frontend work:

✅ **Phase 1**: Database migrations (DONE)
✅ **Phase 2**: Signup function (DONE)
✅ **Phase 3**: Signin function (DONE)
✅ **Phase 4**: Paddle webhook (DONE)

**Next**:

- [ ] **Phase 5**: Update frontend login handler to process trial info
- [ ] **Phase 6**: Create trial banner component in dashboard
- [ ] **Phase 7**: Build pricing/checkout page
- [ ] **Phase 8**: Implement trial expiry checks

---

## Important Notes

### Paddle Custom Data Format

When initiating Paddle checkout from frontend, pass this custom_data:

```javascript
{
  user_id: currentUser.id,           // or userId
  organization_id: currentOrg.id,    // or organizationId
  email: currentUser.email
}
```

The webhook now handles both camelCase and snake_case variations.

### Trial Days Calculation

The signin function returns `daysRemaining` calculated as:

```typescript
Math.ceil((trialExpiresAt - now) / (1000 * 60 * 60 * 24));
```

This can be negative if trial has expired.

### Database Helper Functions

You mentioned you didn't add the helper functions from the migrations - that's fine! The edge functions query the database directly. If you want to add them later for convenience, they're in `DATABASE_MIGRATIONS.sql`.

---

## Troubleshooting

### Issue: pending_organizations not found

**Cause**: Database migration didn't add user_id column
**Fix**: Run the ALTER TABLE command from DATABASE_MIGRATIONS.sql

### Issue: organizations.is_trial doesn't exist

**Cause**: Database migration not run
**Fix**: Run the migrations in DATABASE_MIGRATIONS.sql

### Issue: Signin returns no organization

**Cause**: User doesn't have organization_members entry
**Fix**: Check that pending_organizations was processed correctly

### Issue: License created with used_licenses = 0

**Cause**: Old webhook code
**Fix**: Redeploy paddle-webhook function

---

## Summary

All edge function updates are complete! The backend now fully supports:

✅ Trial period (14 days)
✅ Pending organization processing
✅ Trial status tracking
✅ Payment-triggered license creation
✅ Trial-to-paid conversion

**Ready for frontend integration!** 🚀
