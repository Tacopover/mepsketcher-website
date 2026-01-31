# has_license Column Synchronization Fix

## Problem

The `has_license` column in the `organization_members` table was not being set to `true` when users were added to an organization, even though the `used_licenses` count in `organization_licenses` was being incremented. This caused a mismatch where:

- `organization_licenses.used_licenses` = 2
- But only 1 member had `has_license = true`

## Root Cause

Multiple code paths were creating or updating organization members without setting `has_license = true`:

1. **Invitation acceptance** (signup function)
2. **Member removal** (members-manager.js) - not setting to `false`
3. **Direct member addition** (members-manager.js)
4. **Member reactivation** (members-manager.js)
5. **New organization creation** (signup function)
6. **Joining existing organization** (signup and signin functions)

## Solution

Updated all code paths to ensure `has_license` is synchronized with `used_licenses`:

### 1. Invitation Acceptance (`supabase/functions/signup/index.ts`)

**Line ~195:**

```typescript
// Accept invitation - update to active and assign license
const { error: updateError } = await supabaseAdmin
  .from("organization_members")
  .update({
    user_id: userId,
    status: "active",
    has_license: true, // ✅ NEW: Assign license to new member
    accepted_at: new Date().toISOString(),
    invite_token_hash: null,
    invite_token_sent_at: null,
    invitation_expires_at: null,
  })
  .eq("id", pendingInvitation.id);
```

### 2. Member Removal (`js/members-manager.js`)

**Line ~380:**

```javascript
async removeMember(userId) {
  const { error } = await this.supabase
    .from('organization_members')
    .update({
      status: 'inactive',
      has_license: false, // ✅ NEW: Remove license assignment
      removed_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('organization_id', this.organizationId)
    .eq('status', 'active');

  // ... (continues with decrementUsedLicenses)
}
```

### 3. Member Reactivation (`js/members-manager.js`)

**Line ~197:**

```javascript
// Reactivate inactive member
const { error: updateError } = await this.supabase
  .from("organization_members")
  .update({
    status: "active",
    has_license: true, // ✅ NEW: Assign license when reactivating
    role: role,
    accepted_at: new Date().toISOString(),
    removed_at: null,
  })
  .eq("id", existingMember.id);

// Increment used_licenses
await this.incrementUsedLicenses();
```

### 4. Direct Member Addition (`js/members-manager.js`)

**Line ~225:**

```javascript
// Add new active member
const { error: insertError } = await this.supabase
  .from("organization_members")
  .insert({
    user_id: userId,
    organization_id: this.organizationId,
    role: role,
    status: "active",
    has_license: true, // ✅ NEW: Assign license to new member
    accepted_at: new Date().toISOString(),
  });

// Increment used_licenses
await this.incrementUsedLicenses();
```

### 5. New Organization Creation (`supabase/functions/signup/index.ts`)

**Line ~322:**

```typescript
// Add user as owner
const { error: memberError } = await supabaseAdmin
  .from("organization_members")
  .insert({
    organization_id: organizationId,
    user_id: userId,
    role: "owner",
    status: "active",
    has_license: true, // ✅ NEW: Assign license to organization owner
    accepted_at: new Date().toISOString(),
  });
```

### 6. Joining Existing Organization (`supabase/functions/signup/index.ts` & `signin/index.ts`)

**signup/index.ts Line ~284:**

```typescript
const { error: memberError } = await supabaseAdmin
  .from("organization_members")
  .insert({
    organization_id: organizationId,
    user_id: userId,
    role: "member",
    status: "active",
    has_license: true, // ✅ NEW: Assign license to new member
    accepted_at: new Date().toISOString(),
  });
```

**Similar changes in `signin/index.ts` for pending organization processing.**

### 7. Paddle Webhook (Already Correct)

The paddle-webhook function was **already setting** `has_license: true` correctly:

```typescript
const { error: memberError } = await supabase
  .from("organization_members")
  .upsert({
    user_id: userId,
    organization_id: organizationId,
    role: "admin",
    status: "active",
    email: userEmail,
    has_license: true, // ✅ Already correct
    accepted_at: new Date().toISOString(),
  });
```

## Verification

After these changes, the following should always be true:

```sql
-- Count of members with licenses should match used_licenses count
SELECT
  o.name AS org_name,
  ol.used_licenses AS license_count,
  COUNT(*) FILTER (WHERE om.has_license = true AND om.status = 'active') AS members_with_license
FROM organizations o
JOIN organization_licenses ol ON o.id = ol.organization_id
JOIN organization_members om ON o.id = om.organization_id
GROUP BY o.id, o.name, ol.used_licenses
HAVING ol.used_licenses != COUNT(*) FILTER (WHERE om.has_license = true AND om.status = 'active');
```

This query should return **zero rows** if everything is synchronized.

## Testing Checklist

- [x] **Invite new member** → Check `has_license = true` after acceptance
- [x] **Remove member** → Check `has_license = false` after removal
- [x] **Reactivate member** → Check `has_license = true` after reactivation
- [x] **Create new organization** → Owner has `has_license = true`
- [x] **Buy more licenses** → Paddle webhook preserves `has_license` state
- [x] **Join existing org** → New member has `has_license = true`

## Deployed Functions

✅ **signup** - Deployed with has_license updates
✅ **signin** - Deployed with has_license updates
✅ **paddle-webhook** - Already correct, no changes needed

## Frontend Files Updated

✅ **js/members-manager.js** - Updated removeMember, reactivation, and addition logic

## Database Consistency

### Fix Existing Data

If you have existing members with incorrect `has_license` values, run this SQL to fix them:

```sql
-- Set has_license = true for all active members
UPDATE organization_members
SET has_license = true
WHERE status = 'active' AND has_license = false;

-- Set has_license = false for all inactive members
UPDATE organization_members
SET has_license = false
WHERE status = 'inactive' AND has_license = true;

-- Verify counts match
SELECT
  o.name,
  ol.used_licenses,
  COUNT(*) FILTER (WHERE om.has_license = true) AS members_with_license
FROM organizations o
JOIN organization_licenses ol ON o.id = ol.organization_id
LEFT JOIN organization_members om ON o.id = om.organization_id
GROUP BY o.id, o.name, ol.used_licenses;
```

## Future Considerations

### Database Trigger Alternative

Consider creating a database trigger to automatically maintain this synchronization:

```sql
-- Trigger function to sync has_license with status changes
CREATE OR REPLACE FUNCTION sync_has_license()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status != 'active' THEN
    NEW.has_license = true;
  ELSIF NEW.status = 'inactive' AND OLD.status = 'active' THEN
    NEW.has_license = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organization_members_sync_license
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_has_license();
```

This would provide an additional safety net at the database level.

## Related Documentation

- [Member Management Implementation](MEMBER_MANAGEMENT_IMPLEMENTATION.md)
- [Invitation Implementation Summary](INVITATION_IMPLEMENTATION_SUMMARY.md)
- [Prorated Pricing Implementation](PRORATED_PRICING_IMPLEMENTATION.md)
