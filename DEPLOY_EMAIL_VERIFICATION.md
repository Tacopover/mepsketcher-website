# Custom Email Verification Deployment Guide

## Overview

Custom email verification system for MepSketcher signup flow, replacing Supabase's default confirmation emails with branded emails sent via Resend.

## What Was Created

### Database

- **Migration**: `supabase/migrations/20260203_email_verification_tokens.sql`
- **Table**: `email_verification_tokens` - stores verification tokens

### Edge Functions

1. **send-verification-email** - Generates tokens and sends custom verification emails
2. **verify-email** - Validates tokens and confirms user email addresses

### Frontend

- **verify-email.html** - Page users land on after clicking verification link

### Modified Files

- **supabase/functions/signup/index.ts** - Updated to use custom verification instead of Supabase's default

## Deployment Steps

### Step 1: Run Database Migration

Go to Supabase Dashboard SQL Editor and run:

```sql
-- Copy contents from: supabase/migrations/20260203_email_verification_tokens.sql
```

Or use the dashboard:

1. Go to: https://supabase.com/dashboard/project/jskwfvwbhyltmxcdsbnm/editor
2. Click "SQL Editor"
3. Copy and paste the migration file
4. Click "Run"

### Step 2: Deploy Edge Functions

Deploy via Supabase Dashboard:

1. **send-verification-email**
   - Go to Edge Functions in dashboard
   - Create/update function: `send-verification-email`
   - Copy code from: `supabase/functions/send-verification-email/index.ts`
   - Deploy

2. **verify-email**
   - Create/update function: `verify-email`
   - Copy code from: `supabase/functions/verify-email/index.ts`
   - Deploy

3. **Update signup function**
   - Update existing `signup` function
   - Copy code from: `supabase/functions/signup/index.ts`
   - Deploy

### Step 3: Verify Environment Variables

Ensure these are set in Supabase Dashboard > Settings > Edge Functions > Secrets:

```
RESEND_API_KEY=re_your_resend_api_key_here
SITE_URL=https://mepsketcher.com
```

(These should already be set from the password reset implementation)

### Step 4: Configure Resend Email Domain

**IMPORTANT**: Update the "from" address in `send-verification-email/index.ts`:

```typescript
from: "MepSketcher <noreply@mepsketcher.com>",
```

Make sure:

1. Domain is verified in Resend dashboard
2. SPF and DKIM records are configured
3. Test emails are working

### Step 5: Test the Flow

1. **Sign up**:
   - Go to: https://mepsketcher.com/login.html
   - Click "Create Account"
   - Fill in details and submit

2. **Check email**:
   - User should receive branded verification email
   - Email should have "Verify Email Address" button
   - Link format: `https://mepsketcher.com/verify-email.html?token=xxx`

3. **Click link**:
   - Should redirect to verify-email.html
   - Token should be validated
   - Success message should appear
   - "Go to Sign In" button should redirect to login

4. **Log in**:
   - User should now be able to log in
   - Email should be confirmed in auth.users table

## Architecture

```
User Signs Up
     ↓
signup edge function
     ↓
Creates user with email_confirm: false
     ↓
Calls send-verification-email
     ↓
Generates token → stores in DB → sends email
     ↓
User receives email → clicks link
     ↓
verify-email.html loads → extracts token
     ↓
Calls verify-email edge function
     ↓
Validates token → confirms email → redirects to login
```

## Differences from Supabase Default

| Feature        | Supabase Default  | Custom Solution              |
| -------------- | ----------------- | ---------------------------- |
| Email Template | Basic, generic    | Branded, customized          |
| Email Provider | Supabase SMTP     | Resend                       |
| Token Storage  | Supabase internal | Custom database table        |
| Token Expiry   | Fixed (varies)    | 24 hours (configurable)      |
| Customization  | Limited           | Full control                 |
| Reliability    | Variable          | Resend's high deliverability |

## Testing Checklist

- [ ] Database migration applied
- [ ] send-verification-email function deployed
- [ ] verify-email function deployed
- [ ] signup function updated and deployed
- [ ] Environment variables set
- [ ] Resend domain configured
- [ ] Test signup flow
- [ ] Verify email received
- [ ] Test email link works
- [ ] Verify user can login after confirmation
- [ ] Test expired token handling
- [ ] Test invalid token handling
- [ ] Test already-verified handling

## Troubleshooting

### Email not received

- Check Resend dashboard for email status
- Verify RESEND_API_KEY is correct
- Check spam folder
- Verify domain is configured in Resend

### Token validation fails

- Check edge function logs
- Verify token format (64 hex characters)
- Check token hasn't expired (24 hours)
- Verify database table exists

### User can't login after verification

- Check auth.users table - email_confirmed_at should be set
- Check edge function logs for errors
- Verify verify-email function ran successfully

## Maintenance

### Cleanup expired tokens

Run periodically (can be automated):

```sql
SELECT cleanup_expired_verification_tokens();
```

This deletes tokens older than 7 days.

## Next Steps

Consider adding:

- Resend verification email button (if first email expires)
- Email verification reminder after 24 hours
- Admin panel to manually verify users
- Analytics on verification rates

---

**Status**: Ready for deployment
**Last Updated**: 2026-02-03
