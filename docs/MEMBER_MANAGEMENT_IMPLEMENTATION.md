# Member Management Implementation Guide

## Overview

This guide walks you through implementing the new member management system with license validation, status tracking, and invitation flow.

## Architecture Summary

### Member Status Model

- **`active`** - Full member with license (has user_id)
- **`inactive`** - Removed but record retained (has user_id, freed license)
- **`pending`** - Invited but not signed up yet (has email, no user_id, no license used)

### License Counting

- `used_licenses` incremented when:
  - Existing user added as active member
  - New user accepts invitation (after signup)
- `used_licenses` decremented when:
  - Member removed (status → inactive)

### Flow

1. **Add existing user** → Check licenses → Add as active → Increment used_licenses
2. **Invite new user** → Check licenses → Create pending invite → Send email (future)
3. **User accepts** → After signup → Update pending to active → Increment used_licenses
4. **Remove member** → Update to inactive → Decrement used_licenses
5. **Re-add removed member** → Reactivate → Increment used_licenses

## Implementation Steps

### Step 1: Run Database Migration

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy and paste the entire contents of `DATABASE_MEMBER_MANAGEMENT.sql`
4. Click **Run** or press `Ctrl+Enter`
5. Verify success by checking the verification queries at the end

**What this does:**

- Adds `status`, `email`, `invited_at`, `accepted_at`, `removed_at` columns to `organization_members`
- Makes `user_id` nullable (for pending invites)
- Adds constraints and indexes
- Creates helper function `get_available_licenses()`
- Updates existing data to `status = 'active'`

### Step 2: Verify Migration

Run these queries in SQL Editor to confirm:

```sql
-- Check columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organization_members'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'organization_members';

-- Test helper function (replace with your org ID)
SELECT get_available_licenses('your-org-id-here');
```

### Step 3: Files Already Created

The following files have been created in your workspace:

1. **`DATABASE_MEMBER_MANAGEMENT.sql`** - Database migration script
2. **`js/members-manager.js`** - Member management class (ES6 module)
3. **Updated `dashboard.html`** - Added member modal
4. **Updated `js/dashboard.js`** - Integrated member management
5. **Updated `css/style.css`** - Added modal and member styles

### Step 4: Test the Implementation

1. **Start your development server** (if you have one)
2. **Open `dashboard.html`** in your browser
3. **Login as an admin user**
4. **Navigate to the Organization section**

#### Test Cases:

**A. Add Existing User**

1. Click "Add Member" button
2. Enter email of an existing user
3. Select role (member or admin)
4. Click "Add Member"
5. Verify: User appears in members list, license count decrements

**B. Invite New User (Future)**

1. Click "Add Member" button
2. Enter email of non-existent user
3. Select role
4. Click "Add Member"
5. Verify: Success message about invitation sent
6. Note: Email sending not yet implemented

**C. Remove Member**

1. Click "Remove" next to a member (not yourself)
2. Confirm the removal
3. Verify: Member disappears from list, license count increments

**D. License Limit**

1. Try to add member when all licenses are used
2. Verify: Error message about no available licenses

**E. Trial Organization**

1. Login with trial organization account
2. Try to add member
3. Verify: Message about upgrading to paid plan

### Step 5: Future Enhancements

#### Email Invitation System (Not Yet Implemented)

To complete the invitation flow, you'll need to:

1. Create a Supabase Edge Function for sending emails:

   - Function name: `send-invite-email`
   - Use a service like SendGrid, Resend, or Supabase's built-in email

2. Uncomment this line in `members-manager.js`:

   ```javascript
   // Line ~165
   await this.sendInvitationEmail(email, invite.id);
   ```

3. Create signup flow that accepts invitation:
   - Check for pending invitation by email during signup
   - Call `membersManager.acceptInvitation(userId, email)` after signup

#### Additional Features

- **Resend Invitation** - Button to resend pending invitations
- **Cancel Invitation** - Delete pending invitations
- **Member Role Change** - Update role for existing members
- **Activity Log** - Track member additions/removals
- **Bulk Invite** - CSV upload for multiple invitations

## Troubleshooting

### Common Issues

**1. Modal doesn't open**

- Check browser console for errors
- Verify `members-manager.js` is loaded as a module
- Ensure `get_available_licenses` function exists in database

**2. License count not updating**

- Check `organization_licenses` table has row for your org
- Verify migration added `used_licenses` default to 1
- Check browser console for SQL errors

**3. Can't add members to trial org**

- This is expected behavior
- Trial organizations can't add members
- Must upgrade to paid plan first

**4. "User not found" error when adding**

- User must have a `user_profiles` entry
- Check if user completed signup flow
- Verify email address is correct

**5. Import errors in console**

- Ensure `dashboard.html` loads `dashboard.js` with `type="module"`
- Verify `members-manager.js` has `export` statement
- Check file paths are correct

### Debug Queries

```sql
-- Check organization status
SELECT id, name, is_trial, owner_id
FROM organizations
WHERE owner_id = 'your-user-id';

-- Check licenses
SELECT * FROM organization_licenses
WHERE organization_id = 'your-org-id';

-- Check members
SELECT om.*, up.email, up.name
FROM organization_members om
LEFT JOIN user_profiles up ON om.user_id = up.id
WHERE om.organization_id = 'your-org-id';

-- Check pending invitations
SELECT * FROM organization_members
WHERE status = 'pending'
AND organization_id = 'your-org-id';
```

## Code Structure

### Key Components

**MembersManager Class** (`js/members-manager.js`)

- `inviteMember(email, role)` - Main entry point for adding members
- `addExistingUserToOrg()` - Adds user with account
- `createPendingInvitation()` - Creates invitation for new users
- `removeMember(userId)` - Removes (inactivates) member
- `getMembers(includeInactive)` - Fetches member list
- `checkAvailableLicenses()` - Validates license availability

**Dashboard Integration** (`js/dashboard.js`)

- `displayOrganizationInfo()` - Renders org section with members
- `setupAddMemberModal()` - Initializes modal event listeners
- `openAddMemberModal()` - Opens modal with license check
- `handleAddMemberSubmit()` - Processes form submission
- `handleRemoveMember()` - Handles member removal

**Database Function** (`get_available_licenses`)

- Checks if organization is in trial mode
- Validates license exists and not expired
- Calculates available licenses
- Returns structured JSON response

## Security Considerations

1. **Row Level Security (RLS)**

   - Ensure RLS policies allow admins to modify members
   - Restrict member addition to organization admins

2. **Server-Side Validation**

   - All validation happens in `get_available_licenses()` function
   - Cannot be bypassed from client side

3. **Atomic Operations**
   - License increment/decrement uses SQL expressions
   - Prevents race conditions

## Testing Checklist

- [ ] Database migration runs without errors
- [ ] Modal opens when clicking "Add Member"
- [ ] License availability checked before opening modal
- [ ] Existing user can be added successfully
- [ ] Pending invitation created for new email
- [ ] Member appears in list after addition
- [ ] License count decreases when member added
- [ ] Member can be removed
- [ ] License count increases when member removed
- [ ] Cannot add member when licenses exhausted
- [ ] Cannot add member in trial mode
- [ ] Error messages displayed appropriately
- [ ] Success messages displayed appropriately
- [ ] Modal closes after successful addition

## Support

If you encounter issues:

1. Check browser console for JavaScript errors
2. Check Supabase logs for database errors
3. Verify migration completed successfully
4. Test with simple queries in SQL Editor
5. Review the troubleshooting section above

## Next Steps

After verifying basic functionality works:

1. **Implement email invitations** - Set up email sending service
2. **Add invitation acceptance** - Modify signup flow
3. **Add member management UI** - Role changes, activity log
4. **Enhance UX** - Loading states, better error messages
5. **Add analytics** - Track member additions/removals

---

**Note**: This implementation provides a solid foundation for member management. The invitation email system and acceptance flow are designed but not yet implemented, allowing you to complete those features when ready.
