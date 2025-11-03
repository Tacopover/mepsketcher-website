# Quote Request Email Setup Guide

## Overview

This guide explains how to set up the email system for enterprise quote requests. When customers fill out the enterprise quote request form on the homepage, an email will be automatically sent to `sales@mepsketcher.com` with their details.

## ✅ What's Already Implemented

### 1. Frontend Changes

- **Dialog Message**: Updated the success dialog to show a simpler message:

  - "Thank you for your interest in MepSketcher!"
  - "Our sales team will contact you as soon as possible"
  - Just a close button (no mailto link anymore)

- **JavaScript Update**: Modified `js/paddle.js` to:
  - Make an API call to the Supabase edge function
  - Handle errors gracefully
  - Show loading state during submission

### 2. Backend Edge Function

- **New Function**: Created `supabase/functions/send-quote-request/index.ts`
- **Functionality**:
  - Receives quote request data from the frontend
  - Sends formatted email to sales team via Resend API
  - Includes all customer details in a professional HTML email
  - Sets customer's email as reply-to for easy responses

## 🔧 Setup Steps

### Step 1: Set Up sales@mepsketcher.com Email Address

#### Option A: Resend Dashboard (Recommended)

1. Log in to your Resend dashboard at https://resend.com
2. Navigate to **Settings** → **Domains**
3. Click on your `mepsketcher.com` domain
4. Click **Add Email Address** or similar option
5. Add `sales@mepsketcher.com` as a verified sender email
6. Follow Resend's verification process (if required)

**Note**: Resend allows you to send FROM any email address on your verified domain. You don't need to create an actual mailbox - Resend just needs permission to send from that address.

#### Option B: Spaceship Email Setup (If you want to receive emails)

If you want `sales@mepsketcher.com` to be a real mailbox that receives emails (not just sends):

1. Log in to Spaceship at https://www.spaceship.com
2. Navigate to your `mepsketcher.com` domain
3. Go to **Email** settings
4. Create a new email address: `sales@mepsketcher.com`
5. Set up forwarding to your personal email, or
6. Set up a mail client to check this inbox

**Important**: Even if you create a real mailbox, you still need to verify the sender in Resend (Step 1A).

### Step 2: Deploy the Edge Function

The edge function is already created at `supabase/functions/send-quote-request/index.ts`. Now you need to deploy it:

#### Using PowerShell (Windows)

```powershell
# Navigate to your project
cd c:\Users\taco\source\repos\mepsketcher-website

# Deploy the function
supabase functions deploy send-quote-request

# Verify it's deployed
supabase functions list
```

#### Alternative: Use the existing deployment script

If you have a deployment script (like `deploy-edge-function.ps1`), you can modify it to include the new function:

```powershell
.\deploy-edge-function.ps1 send-quote-request
```

### Step 3: Verify Environment Variables

The edge function requires the `RESEND_API_KEY` environment variable. This should already be set up in your Supabase project, but verify:

1. Go to Supabase dashboard → Your Project
2. Navigate to **Settings** → **Edge Functions**
3. Check that `RESEND_API_KEY` is set
4. If not, add it:
   ```
   Key: RESEND_API_KEY
   Value: re_xxxxxxxxxxxxx (your Resend API key)
   ```

### Step 4: Test the Implementation

1. Open your website in a browser
2. Navigate to the homepage pricing section
3. Click **"Request Quote"** on the Enterprise card
4. Fill out the form with test data:
   - Name: Test User
   - Email: your-test-email@example.com
   - Company: Test Company
   - Phone: (optional)
   - Licenses: 100
   - Requirements: Testing the quote system
5. Click **"Request Quote"** to submit
6. Verify:
   - You see the success message
   - You receive an email at `sales@mepsketcher.com` (or wherever it forwards)
   - The email contains all the form data
   - Reply-to is set to the customer's email

### Step 5: Monitor and Debug

If emails aren't being received:

1. **Check Supabase Logs**:

   ```powershell
   supabase functions logs send-quote-request
   ```

2. **Check Resend Dashboard**:

   - Go to https://resend.com/emails
   - Look for recent email sends
   - Check for errors or bounces

3. **Verify DNS Settings** (if emails bounce):
   - Ensure SPF, DKIM, and DMARC records are properly configured in Spaceship
   - Resend should provide these records in their domain settings

## 📧 Email Format

The email sent to your sales team will look like this:

**Subject**: Enterprise Quote Request - [Company Name] ([Number] licenses)

**Content**:

- Contact Information section with name, email, company, phone
- License Requirements section showing number of licenses needed
- Special Requirements section (if provided)
- Quick action button to reply directly to the customer
- Formatted timestamp

The customer's email is set as the **reply-to** address, so you can simply hit reply in your email client.

## 🔒 Security Notes

- The edge function does NOT require authentication (anyone can submit a quote request)
- This is intentional - you want potential customers to easily request quotes
- Form data is validated before sending
- No sensitive information is stored in the database
- Email is sent server-side via Resend API for security

## 🎯 What Happens Next

After setup is complete:

1. Customer fills out enterprise quote form on homepage
2. Form data is sent to Supabase edge function
3. Edge function formats and sends email via Resend to `sales@mepsketcher.com`
4. Customer sees success message
5. You receive email with customer details and can reply directly

## 📝 Configuration Reference

### Email Address

- **Sender**: `MepSketcher Quote System <noreply@mepsketcher.com>`
- **Recipient**: `sales@mepsketcher.com`
- **Reply-To**: Customer's email address (for easy replies)

### Form Fields

- **Required**: Name, Email, Company, Number of Licenses
- **Optional**: Phone, Special Requirements

### Minimum Licenses

Currently set to 100+ (configured in `paddle-config.js`). This is shown in the form as a placeholder and minimum value.

## 🚀 Future Enhancements

Potential improvements you could add later:

1. **Database Storage**: Store quote requests in Supabase for tracking
2. **Auto-Response**: Send confirmation email to customer
3. **Slack/Discord Notifications**: Real-time notifications to your team
4. **CRM Integration**: Automatically create leads in your CRM
5. **Follow-up Reminders**: Automated follow-up if no response after X days

## ❓ FAQ

**Q: Can I use a different email address?**
A: Yes! Edit the `SALES_EMAIL` constant in `supabase/functions/send-quote-request/index.ts` to any email address you want.

**Q: Do I need to create a mailbox for sales@mepsketcher.com?**
A: Not necessarily. Resend can send FROM that address without a mailbox existing. However, if customers might email you directly at that address, you should create a real mailbox or set up forwarding.

**Q: What if I want to CC other people?**
A: Modify the edge function's `to` field to include multiple addresses:

```typescript
to: ["sales@mepsketcher.com", "manager@mepsketcher.com"],
```

**Q: How do I change the email template?**
A: Edit the `generateQuoteRequestEmailHTML()` function in the edge function. The template uses inline CSS for maximum email client compatibility.

**Q: Will this work in sandbox/development mode?**
A: Yes, as long as your Resend API key is valid. You might want to use Resend's test mode or a different email address for development.

## 📞 Support

If you encounter issues:

1. Check Supabase function logs
2. Check Resend dashboard for email delivery status
3. Verify DNS records in Spaceship
4. Ensure RESEND_API_KEY is correctly set in Supabase

## ✅ Checklist

- [ ] Set up `sales@mepsketcher.com` in Resend as verified sender
- [ ] (Optional) Create mailbox for `sales@mepsketcher.com` in Spaceship
- [ ] Deploy edge function to Supabase
- [ ] Verify `RESEND_API_KEY` is set in Supabase
- [ ] Test the quote request form end-to-end
- [ ] Verify email is received at `sales@mepsketcher.com`
- [ ] Test replying to a quote request email
- [ ] Monitor for the first week to ensure everything works smoothly
