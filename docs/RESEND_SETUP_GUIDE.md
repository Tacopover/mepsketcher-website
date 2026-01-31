# Resend Email Service Setup Guide

## What You Need to Provide

To complete the email invitation setup, I need the following information:

### 1. Resend Account Setup

**Step 1: Create Resend Account**

- Go to https://resend.com
- Sign up for a free account
- Free tier includes: 100 emails/day, 3,000 emails/month

**Step 2: Verify Your Domain** (CRITICAL)

- In Resend dashboard, go to "Domains"
- Click "Add Domain"
- Enter your domain: `mepsketcher.com`
- You'll receive DNS records to add:

```
TXT Record:
Host: @ or root
Value: resend-verify=XXXXXXXXXXXXX

CNAME Record (for email tracking):
Host: em.mepsketcher.com
Value: feedback-smtp.resend.com
```

**Action Required:**

- Add these DNS records in your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
- Wait 5-10 minutes for DNS propagation
- Click "Verify" in Resend dashboard

**Step 3: Get API Key**

- In Resend dashboard, go to "API Keys"
- Click "Create API Key"
- Name it: "MepSketcher Production"
- Copy the API key (starts with `re_`)
- **IMPORTANT**: Save this key - you'll only see it once!

---

## What I Need From You

### Required Information:

1. **Resend API Key**

   ```
   Format: re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   Please provide this securely (don't post publicly)

2. **Domain Verification Status**

   - Have you added the DNS records?
   - Is the domain showing as "Verified" in Resend?

3. **Sender Email Configuration**

   - Current default: `noreply@mepsketcher.com`
   - Do you want to change this? (e.g., `invitations@mepsketcher.com`)

4. **Site URL Confirmation**
   - Production URL: `https://mepsketcher.com`
   - Is this correct?
   - Do you have a staging/test environment?

---

## Deployment Steps (After You Provide Info)

### Step 1: Set Environment Variables

Once you provide the Resend API key, run these commands in PowerShell:

```powershell
# Navigate to your project
cd c:\Users\taco\source\repos\mepsketcher-website

# Set Resend API key (replace with your actual key)
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Set site URL
supabase secrets set SITE_URL=https://mepsketcher.com

# Verify secrets are set
supabase secrets list
```

### Step 2: Deploy Edge Functions

```powershell
# Deploy the invitation email sender
supabase functions deploy send-invitation-email

# Re-deploy signup function with invitation handling
supabase functions deploy signup
```

### Step 3: Database Migration

Run this SQL in Supabase SQL Editor:

```sql
-- Ensure invitation columns exist with correct names
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_invite_token_hash
  ON organization_members(invite_token_hash)
  WHERE status = 'pending';

-- Verify columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organization_members'
  AND column_name IN ('invite_token_hash', 'invite_token_sent_at', 'invitation_expires_at');
```

### Step 4: Update Frontend Files

```powershell
# The following files are already created/updated:
# - supabase/functions/send-invitation-email/index.ts
# - supabase/functions/signup/index.ts
# - accept-invitation.html

# Just need to deploy them to your web host
```

---

## Testing Checklist

### Phase 1: Email Sending Test

After deployment, test email sending:

1. Log into dashboard as admin
2. Click "Add Member"
3. Enter test email address
4. Check:
   - [ ] Email arrives in inbox (not spam)
   - [ ] Invitation link works
   - [ ] Email displays correctly on mobile
   - [ ] Email displays correctly on desktop
   - [ ] "From" address shows as MepSketcher

### Phase 2: Invitation Flow Test

1. **New User (No Account)**

   - [ ] Click invitation link
   - [ ] Accept-invitation page loads correctly
   - [ ] Click "Accept & Sign Up"
   - [ ] Signup page pre-fills email
   - [ ] After signup, user is added to organization
   - [ ] License count increments
   - [ ] User can log in and see organization

2. **Existing User**

   - [ ] Click invitation link
   - [ ] Accept-invitation page loads
   - [ ] Click "Accept & Sign Up"
   - [ ] User can log in with existing account
   - [ ] User is added to organization
   - [ ] License count increments

3. **Edge Cases**
   - [ ] Expired invitation shows error
   - [ ] Invalid token shows error
   - [ ] Already-used token shows error
   - [ ] Token works only once (single-use)

---

## Email Preview

This is what invited users will receive:

**Subject:** `[Inviter Name] invited you to join [Organization Name] on MepSketcher`

**Content:**

```
-------------------------------------------
            MepSketcher
-------------------------------------------

You've been invited!

[Inviter Name] has invited you to join
[Organization Name] on MepSketcher as a
[Role].

MepSketcher is a specialized CAD application
for designing MEP (Mechanical, Electrical,
and Plumbing) systems on PDF drawings.

    [Accept Invitation Button]

This invitation expires on [Date]

-------------------------------------------
```

---

## Troubleshooting

### Problem: Emails not arriving

**Check:**

1. Resend domain is verified (check Resend dashboard)
2. API key is correct (`supabase secrets list`)
3. Check Resend logs for delivery status
4. Check spam folder
5. Verify sender email domain matches verified domain

**Solution:**

```powershell
# Re-verify secrets
supabase secrets list

# Check edge function logs
supabase functions logs send-invitation-email
```

### Problem: "Email service not configured" error

**Solution:**

```powershell
# Ensure RESEND_API_KEY is set
supabase secrets set RESEND_API_KEY=re_your_key_here

# Re-deploy function
supabase functions deploy send-invitation-email
```

### Problem: Invitation link doesn't work

**Check:**

1. `SITE_URL` is correct (`supabase secrets list`)
2. `accept-invitation.html` is deployed to web server
3. Token is correctly passed in URL

---

## Security Notes

✅ **Tokens are hashed** - Database breach doesn't expose usable tokens  
✅ **Single-use tokens** - Token is cleared after acceptance  
✅ **Time-limited** - Tokens expire after 7 days  
✅ **Email verification** - Tokens only work for the invited email address

---

## Cost Estimates

**Resend Pricing:**

- Free tier: 3,000 emails/month
- Paid tier: $20/month for 50,000 emails

**Typical Usage:**

- 10 team invitations/day = ~300 emails/month (well within free tier)
- 100 team invitations/day = ~3,000 emails/month (still free!)

---

## Next Steps

Please provide:

1. ✅ Resend API Key (`re_xxxxxxxxxx`)
2. ✅ Confirm domain verification status
3. ✅ Confirm sender email preference
4. ✅ Confirm production URL

Once I have this info, I'll help you:

- Set the environment variables
- Deploy the edge functions
- Test the complete flow
- Troubleshoot any issues

---

## Alternative: Testing Without Domain Verification

If you want to test BEFORE verifying your domain:

**Option 1: Use Resend's Test Domain**

- Can send to ANY email address
- May land in spam
- For testing only

**Option 2: Verify a Subdomain**

- Verify `test.mepsketcher.com` instead
- Use `noreply@test.mepsketcher.com` as sender
- Switch to main domain when ready

Let me know which approach you prefer!
