# Invitation System - Read-Only Fields Update

## Overview

Updated the invitation system to pre-fill and lock both the **email** and **organization name** fields in the signup form when a user accepts an invitation. This prevents users from accidentally entering the wrong organization name or email address, which could cause errors in the invitation acceptance process.

## Changes Made

### 1. **send-invitation-email/index.ts**

Added organization name to the invitation URL:

```typescript
// Before
const invitationUrl = `${SITE_URL}/accept-invitation.html?token=${plainToken}`;

// After
const invitationUrl = `${SITE_URL}/accept-invitation.html?token=${plainToken}&email=${encodeURIComponent(
  email
)}&org=${encodeURIComponent(organizationName)}`;
```

### 2. **accept-invitation.html**

Updated the accept button to pass the organization name to the login page:

```javascript
// Construct URL with all parameters
const signupUrl = new URL("login.html", window.location.origin);
signupUrl.searchParams.set("invitation_token", plainToken);
signupUrl.searchParams.set("email", invitation.email);
signupUrl.searchParams.set("organization", invitation.organizations.name);

document.getElementById("accept-btn").href = signupUrl.toString();
```

### 3. **login-page.js**

Enhanced invitation handling to:

- Detect the `organization` URL parameter
- Pre-fill both email and organization name fields
- Make both fields read-only with visual styling
- Update the hint text to indicate joining an existing organization

```javascript
// Get parameters
const invitationToken = urlParams.get("invitation_token");
const invitedEmail = urlParams.get("email");
const invitedOrganization = urlParams.get("organization");

// Pre-fill and lock email field
const emailInput = document.getElementById("signupEmail");
emailInput.value = invitedEmail;
emailInput.readOnly = true;
emailInput.style.backgroundColor = "#f5f5f5";
emailInput.style.cursor = "not-allowed";

// Pre-fill and lock organization field
const orgInput = document.getElementById("organizationName");
orgInput.value = invitedOrganization;
orgInput.readOnly = true;
orgInput.style.backgroundColor = "#f5f5f5";
orgInput.style.cursor = "not-allowed";

// Update hint text
const orgHint = orgInput.nextElementSibling;
if (orgHint && orgHint.classList.contains("form-hint")) {
  orgHint.textContent = "You are joining an existing organization";
  orgHint.style.color = "#0066cc";
}
```

## User Experience

### Before

- User clicks invitation link
- Signup form appears with only email pre-filled
- User must manually enter organization name
- **Risk**: User enters wrong organization name → invitation fails

### After

- User clicks invitation link
- Signup form appears with both email AND organization pre-filled
- Both fields are grayed out and read-only
- Hint text shows "You are joining an existing organization"
- **Result**: No risk of entering wrong information

## Visual Changes

When accepting an invitation, the signup form now shows:

```
Full Name:          [___________________]  (editable)
Email Address:      [user@example.com___]  (grayed out, read-only)
Organization Name:  [Acme Corporation___]  (grayed out, read-only)
                    You are joining an existing organization (blue text)
Password:           [___________________]  (editable)
Confirm Password:   [___________________]  (editable)
```

## Testing

### Manual Testing URL Format

```
https://mepsketcher.com/login.html?invitation_token=TOKEN&email=EMAIL&organization=ORG_NAME
```

### Expected Behavior

1. ✅ Email field is pre-filled and read-only
2. ✅ Organization field is pre-filled and read-only
3. ✅ Both fields have gray background (`#f5f5f5`)
4. ✅ Cursor changes to `not-allowed` on hover
5. ✅ Hint text says "You are joining an existing organization" in blue
6. ✅ User can only fill in name and password fields
7. ✅ Submission passes correct organization name to signup function

## Deployment Steps

1. **Deploy updated send-invitation-email function:**

   ```bash
   npx supabase functions deploy send-invitation-email
   ```

2. **Test locally:**

   - Send a test invitation
   - Check email for the new URL format with `&org=` parameter
   - Click link and verify both fields are locked

3. **Deploy accept-invitation.html to production**

4. **Test end-to-end:**
   - Send invitation from dashboard
   - Accept invitation via email link
   - Verify signup works correctly
   - Check new member appears in dashboard

## Database Schema

No database changes required. The organization name is passed through the URL and signup flow but is already stored in the `organization_members` table via the `organization_id` foreign key.

## Security Considerations

- ✅ Organization name is only used for display purposes
- ✅ Actual organization membership is validated via the invitation token hash
- ✅ Making fields read-only prevents accidental input errors, not security bypasses
- ✅ Server-side validation still occurs in the signup edge function

## Backwards Compatibility

- Old invitation links without `&org=` parameter will still work but won't pre-fill organization name
- Users will see the normal signup form in that case
- Recommend re-sending any pending invitations after deployment to get new format

## Related Files

- `/supabase/functions/send-invitation-email/index.ts`
- `/accept-invitation.html`
- `/js/login-page.js`
- `/js/auth.js` (already updated to pass invitationToken)
- `/supabase/functions/signup/index.ts` (already handles invitation acceptance)

## Benefits

1. **Prevents User Errors**: Users can't accidentally type the wrong organization name
2. **Better UX**: Clear visual indication that they're joining an existing org
3. **Reduces Support**: Fewer failed invitations due to typos
4. **Professional**: Looks more polished and intentional
