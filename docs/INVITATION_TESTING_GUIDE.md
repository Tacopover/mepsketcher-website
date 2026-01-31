# Invitation Testing Guide

## Testing Invitation Flow Without accept-invitation.html Deployed

Since `accept-invitation.html` is not yet deployed, you can test the invitation flow by directly navigating to the login page with URL parameters.

## Testing Steps

### 1. Send an Invitation Email

From the dashboard, use the Members Manager to send an invitation:

- Click "Invite Member"
- Enter the new member's email address
- Submit the form

### 2. Extract the Invitation Token and Organization Name

Check the email sent to the invited user. The email will contain a link like:

```
https://mepsketcher.com/accept-invitation.html?token=abc123xyz...&email=newuser@example.com&org=Acme+Corporation
```

Extract:

- The `token` value from this link
- The `email` value
- The `org` value (the organization name, URL-encoded)

### 3. Construct a Test URL

Create a URL to the login page with the invitation parameters:

```
https://mepsketcher.com/login.html?invitation_token=abc123xyz...&email=newuser@example.com&organization=Acme+Corporation
```

Replace:

- `abc123xyz...` with the actual token from the email
- `newuser@example.com` with the invited user's email
- `Acme+Corporation` with the organization name (URL-encoded)

### 4. Test the Signup Flow

Navigate to the test URL. The login page should:

- ✅ Automatically switch to the Signup tab
- ✅ Pre-fill the email field with the invited user's email
- ✅ Make the email field **read-only** (grayed out)
- ✅ Pre-fill the organization name field
- ✅ Make the organization name field **read-only** (grayed out)
- ✅ Update the organization hint to say "You are joining an existing organization"
- ✅ Display an invitation message: "✉️ You've been invited to join an organization! Complete signup below."

### 5. Complete Signup

1. Enter the user's full name
2. Create a password (min 8 characters)
3. Confirm the password
4. **Note**: The email and organization name fields are pre-filled and locked - the user cannot change them
5. Check the "I agree to the Terms of Service" checkbox
6. Click "Sign Up"

### 6. Verify Email Confirmation

The user will receive a confirmation email from Supabase. They must click the confirmation link before they can sign in.

### 7. Verify Member Activation

After email confirmation, check the dashboard:

- The new member should appear in the Members list with status "active"
- The organization's available licenses should be incremented by 1

## What Happens Behind the Scenes

1. **Token Verification**: The signup edge function hashes the provided token and compares it with the stored hash in the database
2. **Expiration Check**: Ensures the invitation hasn't expired (7-day window)
3. **Member Activation**: Updates the organization_members record to set the user_id and mark as active
4. **License Update**: Increments the available_licenses count for the organization

## Code Flow

```
login.html?invitation_token=TOKEN&email=EMAIL&organization=ORG_NAME
  ↓
login-page.js detects URL parameters
  ↓
Pre-fills signup form with email and organization name
  ↓
Makes both fields read-only (grayed out)
  ↓
Switches to signup tab with invitation message
  ↓
User completes signup form (name, password only)
  ↓
authService.signUp(email, password, name, orgName, invitationToken)
  ↓
signup edge function receives invitationToken
  ↓
Edge function hashes token and verifies against database
  ↓
Creates user account with Supabase Auth
  ↓
Activates organization member record
  ↓
Increments available licenses
  ↓
Returns success
```

## Troubleshooting

### Email or Organization Field Not Pre-filled

- Check that all three parameters are in the URL: `invitation_token`, `email`, AND `organization`
- Verify the URL encoding is correct (spaces should be + or %20)
- Check browser console for JavaScript errors

### "Invalid or expired invitation token" Error

- Token may have expired (7 days from sent date)
- Token may have already been used
- Token may be incorrectly copied (ensure no line breaks or extra characters)

### User Created But Not Activated

- Check the database `organization_members` table
- Verify the `user_id` field was populated
- Ensure `invite_token_hash` matches the hashed token

### License Count Not Updated

- Check the signup edge function logs in Supabase dashboard
- Verify the license increment query executed successfully
- Check organization_licenses.available_licenses value

## Database Queries for Debugging

### Check invitation status:

```sql
SELECT
  om.*,
  up.email as invited_email,
  o.name as org_name
FROM organization_members om
LEFT JOIN user_profiles up ON om.invited_email = up.email
LEFT JOIN organizations o ON om.organization_id = o.id
WHERE om.invited_email = 'newuser@example.com';
```

### Check license count:

```sql
SELECT
  ol.*,
  o.name as org_name
FROM organization_licenses ol
JOIN organizations o ON ol.organization_id = o.id
WHERE o.id = 'YOUR_ORG_ID';
```

### Check for pending invitations:

```sql
SELECT
  om.*,
  o.name as org_name,
  EXTRACT(DAY FROM (NOW() - om.invite_token_sent_at)) as days_since_sent
FROM organization_members om
JOIN organizations o ON om.organization_id = o.id
WHERE om.user_id IS NULL
  AND om.invite_token_hash IS NOT NULL
ORDER BY om.invite_token_sent_at DESC;
```

## Next Steps

Once testing is complete and working:

1. Deploy `accept-invitation.html` to production
2. Update invitation email template to use the accept-invitation page URL
3. Remove the manual URL construction step from the process

## Local Testing (if running locally)

If testing locally on `http://localhost` or similar:

```
http://localhost:8080/login.html?invitation_token=abc123xyz...&email=newuser@example.com
```

Make sure:

- The `SITE_URL` environment variable in the edge function matches your local URL
- The invitation email uses the correct local URL
- CORS is configured properly for local development
