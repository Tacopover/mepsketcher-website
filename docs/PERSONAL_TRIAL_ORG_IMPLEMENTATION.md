# Personal Trial Organization Implementation

## Overview

This implementation addresses the trial user workflow by creating a temporary personal organization for every new trial user. This organization is automatically cleaned up when the user either:
1. **Scenario 1**: Purchases a license and creates their own organization
2. **Scenario 2**: Gets invited to an existing organization by an admin

## Architecture

### Database Schema Changes

**New Column: `organizations.is_personal_trial_org`**
- Type: `BOOLEAN`
- Default: `false`
- Purpose: Flags organizations that were auto-created for trial users
- Index: `idx_organizations_personal_trial` (for efficient cleanup queries)

```sql
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_personal_trial_org BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organizations_personal_trial 
ON organizations(is_personal_trial_org) 
WHERE is_personal_trial_org = true;
```

### Trial User Sign-Up Flow

When a new user signs up for a trial:

1. **Auth Trigger Fires**: `handle_new_user()` function executes
2. **Personal Org Created**: Organization named "Personal Trial - {email}"
   - Marked with `is_personal_trial_org = true`
3. **User Created**: User becomes admin of their personal org
4. **Trial License Created**: 14-day trial license
5. **License Linked**: User linked to trial via `user_licenses` table

```sql
-- handle_new_user() trigger creates:
organizations:
  name: "Personal Trial - user@example.com"
  is_personal_trial_org: true
  
users:
  organization_id: <personal_org_id>
  role: 'admin'
  
trial_licenses:
  expires_at: NOW() + 14 days
  
user_licenses:
  license_id: NULL  -- NULL indicates trial
```

## Scenario 1: Trial User Purchases License

### Flow
1. User clicks "Buy License" on website
2. User is authenticated (already has trial account)
3. Paddle checkout opens
4. User completes purchase
5. **Paddle webhook** (`paddle-webhook/index.ts`) fires:
   - Checks if user has personal trial org
   - Creates real organization (with user-provided name if available)
   - Updates user's `organization_id` to new org
   - **Deletes personal trial org**
   - Creates license entry

### Code Changes

**File**: `supabase/functions/paddle-webhook/index.ts`

```typescript
// Before creating organization, check for personal trial org
const { data: existingUser } = await supabase
  .from("users")
  .select("organization_id, organizations(id, name, is_personal_trial_org)")
  .eq("id", userId)
  .single();

let oldPersonalOrgId: string | null = null;

if (existingUser && existingUser.organizations?.is_personal_trial_org) {
  oldPersonalOrgId = existingUser.organizations.id;
}

// Create new real organization
const { data: newOrg } = await supabase
  .from("organizations")
  .insert({
    name: organizationName || `${userEmail}'s Organization`,
    owner_id: userId,
    is_trial: false,
    is_personal_trial_org: false,  // This is a real org
  })
  .select()
  .single();

// Update user's organization
await supabase
  .from("users")
  .update({ organization_id: newOrg.id })
  .eq("id", userId);

// Delete old personal trial org
if (oldPersonalOrgId) {
  await supabase
    .from("organizations")
    .delete()
    .eq("id", oldPersonalOrgId)
    .eq("is_personal_trial_org", true);
}
```

## Scenario 2: Trial User Invited to Existing Org

### Flow
1. Admin discovers trial user (coworker) exists
2. Admin calls `assign-trial-user` Edge Function
3. Function validates:
   - Requesting user is admin
   - License belongs to admin's org
   - Trial user is in personal trial org
4. User is moved from personal org to real org
5. **Personal trial org is deleted**
6. User gets license assigned

### Code Implementation

**New File**: `supabase/functions/assign-trial-user/index.ts`

**API Endpoint**: `POST /functions/v1/assign-trial-user`

**Request Body**:
```json
{
  "trial_user_email": "coworker@company.com",
  "license_id": "lic_abc123"
}
```

**Authorization**: Requires Bearer token (authenticated admin)

**Response**:
```json
{
  "success": true,
  "message": "User coworker@company.com successfully added to organization",
  "user_id": "uuid",
  "organization_id": "uuid",
  "license_id": "uuid"
}
```

**Key Logic**:
```typescript
// Verify user is in personal trial org
if (!userOrg?.is_personal_trial_org) {
  return error("User not in trial organization");
}

// Move user to real organization
await supabase
  .from("users")
  .update({
    organization_id: admin_org_id,
    role: "member",
  })
  .eq("id", trialUser.id);

// Update license assignment
await supabase
  .from("user_licenses")
  .update({ license_id: license_id })
  .eq("user_id", trialUser.id);

// Delete personal trial org
await supabase
  .from("organizations")
  .delete()
  .eq("id", old_org_id)
  .eq("is_personal_trial_org", true);
```

## Cleanup: Orphaned Organizations

### Purpose
Handles edge cases where personal trial orgs aren't properly deleted (network errors, crashes, etc.)

**New File**: `supabase/functions/cleanup-orphaned-orgs/index.ts`

**API Endpoint**: `POST /functions/v1/cleanup-orphaned-orgs`

**Authorization**: Requires service role key (secure)

**Usage**: Run periodically via cron job or manually

**Logic**:
```typescript
// Find personal trial orgs with no users
const { data: orphanedOrgs } = await supabase
  .from("organizations")
  .select("id, name, created_at, users(id)")
  .eq("is_personal_trial_org", true);

// Filter orgs with no users
const orgsToDelete = orphanedOrgs.filter(
  (org) => !org.users || org.users.length === 0
);

// Delete each orphaned org
for (const org of orgsToDelete) {
  await supabase
    .from("organizations")
    .delete()
    .eq("id", org.id)
    .eq("is_personal_trial_org", true);
}
```

## Deployment Steps

### 1. Run Database Migration
```bash
# In Supabase SQL Editor, run:
DATABASE_PERSONAL_TRIAL_ORG.sql
```

### 2. Deploy Edge Functions
```bash
# Deploy assign-trial-user function
npx supabase functions deploy assign-trial-user

# Deploy cleanup function
npx supabase functions deploy cleanup-orphaned-orgs
```

### 3. Update Existing Paddle Webhook
```bash
# Redeploy with new personal org cleanup logic
npx supabase functions deploy paddle-webhook
```

### 4. Frontend Integration (Optional)

Add to dashboard JavaScript:

```javascript
/**
 * Assign a trial user to the organization
 */
async function assignTrialUserToOrganization(trialUserEmail, licenseId) {
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(
    `${supabase.supabaseUrl}/functions/v1/assign-trial-user`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        trial_user_email: trialUserEmail,
        license_id: licenseId,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return await response.json();
}
```

### 5. Set Up Cleanup Cron Job (Optional)

Create a scheduled job to run cleanup weekly:

```bash
# Using Supabase Cron or external service
curl -X POST \
  https://your-project.supabase.co/functions/v1/cleanup-orphaned-orgs \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

## Testing

### Test Scenario 1: Trial → Purchase
1. Sign up for trial
2. Verify personal trial org created: 
   ```sql
   SELECT * FROM organizations WHERE is_personal_trial_org = true;
   ```
3. Purchase license
4. Verify personal org deleted and new org created

### Test Scenario 2: Trial → Invited
1. User A signs up for trial (gets personal org)
2. User B (admin) buys license (has real org)
3. User B calls `assign-trial-user` with User A's email
4. Verify:
   - User A moved to User B's org
   - User A's personal org deleted
   - User A assigned to license

### Test Cleanup Function
1. Create orphaned personal org manually:
   ```sql
   INSERT INTO organizations (name, is_personal_trial_org)
   VALUES ('Test Orphaned Org', true);
   ```
2. Call cleanup function
3. Verify org deleted

## Rollback Plan

If issues arise, rollback in this order:

1. **Disable trigger** (prevents new personal orgs):
   ```sql
   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
   ```

2. **Revert paddle-webhook** to previous version:
   ```bash
   git checkout HEAD~1 supabase/functions/paddle-webhook/index.ts
   npx supabase functions deploy paddle-webhook
   ```

3. **Remove column** (after ensuring no personal orgs exist):
   ```sql
   ALTER TABLE organizations DROP COLUMN is_personal_trial_org;
   ```

## Benefits

✅ **Consistent State**: Every user always has an `organization_id`
✅ **No Schema Changes**: Works with existing table constraints
✅ **Automatic Cleanup**: Personal orgs deleted when no longer needed
✅ **Minimal Frontend Changes**: Trial flow works as before
✅ **Safety Checks**: Multiple safeguards against accidental deletion
✅ **Audit Trail**: Can track personal orgs with queries

## Future Enhancements

1. **UI for Admin Discovery**: Add dashboard UI for admins to search for trial users by email
2. **Invitation Flow**: Extend invitation system to directly invite trial users
3. **Analytics**: Track conversion rates from trial → purchase vs trial → invited
4. **Notifications**: Email users when their trial org is converted to real org

## Files Changed/Created

### Created
- `DATABASE_PERSONAL_TRIAL_ORG.sql` - Database migration
- `supabase/functions/assign-trial-user/index.ts` - Scenario 2 handler
- `supabase/functions/cleanup-orphaned-orgs/index.ts` - Cleanup function
- `docs/PERSONAL_TRIAL_ORG_IMPLEMENTATION.md` - This file

### Modified
- `supabase/functions/paddle-webhook/index.ts` - Added personal org cleanup in Scenario 1

## Support

For questions or issues:
- Check logs in Supabase Dashboard → Edge Functions
- Verify database state with SQL queries
- Run cleanup function if orphaned orgs suspected
- Review this documentation for expected behavior
