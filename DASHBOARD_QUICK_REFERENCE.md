# Dashboard Quick Reference Guide

## 🎯 New Features Overview

### 1. Secure Configuration ✅

- Supabase credentials now stored in `js/supabase-config.local.js` (gitignored)
- See `CONFIG_SETUP.md` for detailed setup instructions
- Template file available: `js/supabase-config.local.js.example`

### 2. Organization Management 🏢

#### For All Users:

- View organization name
- See your role (admin/member)

#### For Admin Users:

- **View Members**: See all organization members with their roles
- **Add Members**: Add new users by email address
  - Enter member email
  - Select role (Admin or Member)
  - Click "Add Member"
- **Remove Members**: Remove users from organization
  - Click "Remove" button next to member
  - Confirm removal
  - Cannot remove yourself

### 3. Unified License Section 📜

#### No Licenses Yet:

- Integrated purchase form appears
- Enter number of licenses (1-1000)
- Select license type (Starter/Professional/Enterprise)
- Click "Buy Licenses"
- Auto-creates organization if you don't have one

#### Have Licenses:

- View license details in modern cards:
  - Organization name
  - License type badge
  - Status badge (Active/Expired)
  - Statistics (Total, Used, Available, Expires)
- **Add More Licenses**:
  - Enter count in the number input (1-1000)
  - Click "Add Licenses"
  - No popup dialogs!
- **Renew License**: Extends by 1 year (for expired licenses)
- **Extend Expiry**: Add custom months (still uses popup)

## 📊 Dashboard Sections

### 1. Account Overview

- Email address
- Email verification status
- Member since date
- Update profile button (coming soon)

### 2. License Summary

- Active licenses count
- Total licenses
- Available licenses

### 3. Organization

**Regular User View**:

- Organization name
- Your role

**Admin View**:

- Organization name
- Your role
- All members list with roles
- Add member form
- Remove member buttons

### 4. Licenses

- Empty state with purchase form (if no licenses)
- License cards with all details (if licenses exist)
- Inline forms for adding licenses
- Action buttons for renewal and extension

## 🎨 UI Elements

### Status Badges:

- **ACTIVE** (green) - License is valid
- **EXPIRED** (red) - License has expired

### Role Badges:

- **ADMIN** (blue) - Full organization access
- **MEMBER** (orange) - Standard access

### License Type Badges:

- **STARTER** (blue)
- **PROFESSIONAL** (blue)
- **ENTERPRISE** (blue)

## 🔐 Security & Permissions

### What Admins Can Do:

- View all organization members
- Add new members to organization
- Remove members from organization
- Purchase and manage licenses
- Add licenses to existing licenses
- Renew and extend licenses

### What Regular Members Can Do:

- View organization name
- View their own role
- View license information
- Cannot add/remove members
- Cannot purchase licenses (admin only)

## 💡 Tips & Best Practices

### For First-Time Setup:

1. Create account and verify email
2. Sign in to dashboard
3. When buying first license, you'll be prompted to create an organization
4. Enter a meaningful organization name
5. Purchase your licenses

### For Organization Admins:

1. Add team members by their registered email addresses
2. Assign appropriate roles (admin for managers, member for users)
3. Monitor license usage in the statistics
4. Renew licenses before expiration

### For Team Members:

1. Register with your work email
2. Wait for admin to add you to organization
3. Sign in to view organization licenses
4. Use desktop app with organization licenses

## 🐛 Troubleshooting

### Configuration Issues:

**Problem**: "Cannot read property 'url' of undefined"
**Solution**:

1. Ensure `js/supabase-config.local.js` exists
2. Check that it exports `SUPABASE_CONFIG`
3. Verify credentials are not placeholder values
4. Clear browser cache and reload

### Organization Management:

**Problem**: "User not found" when adding member
**Solution**:

- User must have registered account first
- Verify email address is correct
- Check they've verified their email

**Problem**: Can't see member management section
**Solution**:

- You must be an admin or organization owner
- Regular members only see organization name

### License Management:

**Problem**: Licenses don't display
**Solution**:

- Check browser console for errors
- Verify organization_licenses table has data
- Ensure RLS policies are set up correctly
- Try signing out and back in

## 📝 Form Validation

### Number Inputs (License Count):

- **Minimum**: 1
- **Maximum**: 1000
- **Type**: Integer only
- **Validation**: Shows error if outside range

### Email Inputs (Add Member):

- **Format**: Valid email address
- **Required**: Yes
- **Validation**: Checks if user exists in system

## ⚡ Keyboard Shortcuts

- **Tab**: Navigate between form fields
- **Enter**: Submit forms (when focused on input)
- **Esc**: Cancel operations (for future modals)

## 🔄 Auto-Refresh Behavior

The dashboard automatically reloads data after:

- Adding a member
- Removing a member
- Buying licenses
- Adding more licenses
- Renewing a license
- Extending a license

This ensures you always see the latest information.

## 📱 Mobile Responsive

All dashboard features work on mobile devices:

- Stacked layout for better readability
- Touch-friendly buttons
- Responsive forms
- Optimized spacing

## 🚀 Performance

### Load Times:

- Initial load: ~1-2 seconds
- Organization data: ~0.5 seconds
- License data: ~0.5 seconds
- Member list (admin): ~0.5 seconds

### Caching:

- User session cached
- Supabase connection pooled
- No unnecessary re-queries

## 📞 Need Help?

1. Check `CONFIG_SETUP.md` for configuration issues
2. Read `DASHBOARD_IMPROVEMENTS.md` for technical details
3. Review `AUTHENTICATION_README.md` for auth problems
4. Check browser console for specific errors
5. Contact project administrator

## 🎯 Quick Actions

### Buy First License:

1. Go to dashboard
2. Fill license count (1-1000)
3. Select type
4. Click "Buy Licenses"
5. Create organization when prompted

### Add Team Member:

1. Go to Organization section
2. Scroll to "Add New Member"
3. Enter their email
4. Select role
5. Click "Add Member"

### Add More Licenses:

1. Find license card
2. Enter count in "Add More Licenses" input
3. Click "Add Licenses" button
4. Confirm success message

---

**Last Updated**: October 8, 2025
**Version**: 2.0 (Dashboard Improvements)
