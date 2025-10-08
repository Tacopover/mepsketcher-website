# 🧪 Quick Testing Guide for Dummy License Purchase

This guide will help you test the Supabase connection and dummy license purchase functionality before implementing payment integration.

## Prerequisites

### 1. Ensure RLS Policies are Set Up

Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New Query):

```sql
-- Enable RLS on organization_licenses table
ALTER TABLE organization_licenses ENABLE ROW LEVEL SECURITY;

-- Users can view licenses for their organizations
CREATE POLICY "Users can view their organization licenses"
ON organization_licenses FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Organization owners can manage licenses
CREATE POLICY "Organization owners can manage licenses"
ON organization_licenses FOR ALL
USING (
  organization_id IN (
    SELECT id 
    FROM organizations 
    WHERE owner_id = auth.uid()
  )
);
```

### 2. Verify Table Structure

Check that your `organization_licenses` table has these columns:
- `id` (uuid, primary key)
- `organization_id` (uuid, foreign key to organizations)
- `total_licenses` (integer)
- `used_licenses` (integer, default 0)
- `license_type` (text)
- `expires_at` (timestamp with time zone)
- `created_at` (timestamp with time zone)
- `updated_at` (timestamp with time zone)

## Step-by-Step Testing

### Test 1: Create a New Account

1. Open your website in a browser (use the actual domain, not file://)
2. Navigate to the login page: `https://mepsketcher.com/login.html`
3. Click the "Create Account" tab
4. Fill in:
   - Name: Test User
   - Email: your-test-email@example.com
   - Password: TestPassword123!
5. Click "Create Account"
6. **Expected Result**: You should see a success message asking you to check your email

### Test 2: Verify Email

1. Check your email inbox
2. Look for an email from Supabase
3. Click the verification link
4. **Expected Result**: Email should be verified

### Test 3: Sign In

1. Return to `https://mepsketcher.com/login.html`
2. Enter your email and password
3. Click "Sign In"
4. **Expected Result**: You should be redirected to the dashboard

### Test 4: View Dashboard

1. After signing in, you should see:
   - Your name at the top (e.g., "Welcome back, Test User!")
   - A profile section with your email
   - A "License Summary" section showing 0 active licenses
   - An empty state message: "You don't have any licenses yet"
   - A "Buy License" button

2. **Expected Result**: Dashboard loads without errors

### Test 5: Dummy License Purchase (First Purchase)

1. Click the "Buy License" button
2. You'll be prompted: "You don't have an organization yet"
3. Enter an organization name (e.g., "Test Company")
4. Click OK
5. You'll be prompted: "How many licenses would you like to purchase?"
6. Enter a number (e.g., 5)
7. Click OK
8. You'll be prompted: "Enter license type (starter, professional, enterprise)"
9. Enter a type (e.g., "professional")
10. Click OK

**Expected Result**: 
- Success message: "License created successfully! Refreshing..."
- Page refreshes automatically
- You should now see a license card with:
  - Organization name: "Test Company"
  - Total Licenses: 5
  - Used: 0
  - Available: 5
  - Type: PROFESSIONAL
  - Expires: (1 year from now)
  - Status badge: "ACTIVE" (green)

### Test 6: Verify Database

1. Go to your Supabase Dashboard
2. Navigate to Table Editor → organizations
3. **Expected**: You should see a new row with name "Test Company" and your user_id as owner_id

4. Navigate to Table Editor → organization_licenses
5. **Expected**: You should see a new row with:
   - organization_id matching your organization
   - total_licenses: 5
   - used_licenses: 0
   - license_type: "professional"
   - expires_at: ~1 year from now

### Test 7: Add More Licenses

1. On the license card, click "Add More Licenses"
2. Enter additional licenses (e.g., 3)
3. Click OK

**Expected Result**:
- Success message
- Total Licenses should update to 8 (5 + 3)
- Available should show 8

### Test 8: Extend Expiry

1. Click "Extend Expiry" on the license card
2. Enter number of months (e.g., 6)
3. Click OK

**Expected Result**:
- Success message
- Expires date should be 6 months later than before

### Test 9: Renew License (After Expiry)

To test renewal:

1. Manually update the expires_at in Supabase to a past date
2. Refresh the dashboard
3. License should show "EXPIRED" badge (red)
4. Click "Renew License"
5. Click OK to confirm

**Expected Result**:
- Success message
- Expires date should be set to 1 year from today
- Status should change back to "ACTIVE"

### Test 10: Purchase Another License (Existing Organization)

1. Click "Buy License" again
2. This time, you already have an organization
3. Enter license count (e.g., 10)
4. Enter license type (e.g., "enterprise")
5. Click OK

**Expected Result**:
- Since you already have a license, it should UPDATE the existing one
- Total should change to 10
- Type should change to ENTERPRISE

**Note**: Currently the system updates the existing license rather than creating multiple licenses per organization. If you want multiple license records per organization, you'll need to modify the `handleBuyLicense` function.

## Troubleshooting

### Issue: "Error loading licenses"

**Possible Causes**:
1. RLS policies not set up correctly
2. User not authenticated
3. Database connection issue

**Solutions**:
1. Check browser console for specific error
2. Verify RLS policies are created
3. Try signing out and back in
4. Check Supabase logs in Dashboard → Logs

### Issue: "Organization not created"

**Possible Causes**:
1. Duplicate organization name
2. RLS policy blocking insert
3. Missing permissions

**Solutions**:
1. Try a different organization name
2. Check Supabase table permissions
3. Verify owner_id is set to auth.uid()

### Issue: License doesn't display after purchase

**Possible Causes**:
1. License created but query not returning it
2. RLS policy blocking SELECT
3. organization_members table not updated

**Solutions**:
1. Check browser console for errors
2. Manually check organization_licenses table in Supabase
3. Verify organization_members has a row linking you to the organization

### Issue: Actions (Add/Extend/Renew) not working

**Possible Causes**:
1. RLS policy blocking UPDATE
2. User not organization owner
3. Database constraint violation

**Solutions**:
1. Verify you're the organization owner
2. Check UPDATE policy in RLS
3. Check browser console for specific error

## Success Criteria

✅ You should be able to:
1. Create an account and verify email
2. Sign in and see the dashboard
3. Create an organization automatically on first purchase
4. Purchase a license (insert into organization_licenses)
5. See the license displayed with correct data
6. Add more licenses (update total_licenses)
7. Extend expiry (update expires_at)
8. Renew expired licenses
9. View all changes in Supabase Dashboard
10. Changes persist after page refresh

## Next Steps After Testing

Once all tests pass:

1. **Document any issues** you encountered
2. **Consider enhancements**:
   - Multiple licenses per organization?
   - Better error messages?
   - Loading states?
   - Confirmation dialogs?

3. **Prepare for Phase 2** (Payment Integration):
   - Choose payment provider (Stripe/Paddle)
   - Design payment flow
   - Create webhook handlers
   - Replace dummy purchase with real payment

4. **Merge to main** when satisfied:
   ```bash
   git checkout main
   git merge feature/user-authentication
   git push origin main
   ```

## Questions to Consider

1. **Multiple Licenses**: Should an organization be able to have multiple license records with different types?
2. **License Activation**: How should the desktop app update `used_licenses` count?
3. **Member Invitations**: How will organization owners invite other users?
4. **Payment Flow**: Where in the UI should payment happen? Modal? New page?
5. **Pricing**: What are the actual prices for starter/professional/enterprise?

---

**Need Help?** Check the detailed `AUTHENTICATION_README.md` for more information about the database schema, architecture, and implementation details.
