# License Expiration & Renewal System - Implementation Guide

## Quick Start

This guide will help you implement the license expiration and renewal system for MepSketcher.

## Step 1: Database Setup

Run the database migrations to add required tables and functions:

```bash
# Navigate to Supabase SQL Editor
# Copy and paste the contents of DATABASE_LICENSE_EXPIRATION.sql
# Execute the migration
```

**What this does:**

- Creates `license_notifications` table to track sent notifications
- Creates `license_renewal_history` table to track all renewals
- Adds grace period tracking fields to `organization_licenses`
- Creates helper functions for license status checks
- Sets up automatic grace period triggers

**Verification:**

```sql
-- Verify tables were created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('license_notifications', 'license_renewal_history');

-- Test the status function
SELECT get_license_status('your-test-org-id');
```

## Step 2: Deploy Edge Function

Deploy the license expiration checker edge function:

```bash
cd supabase/functions/license-expiration-checker

# Deploy to Supabase
supabase functions deploy license-expiration-checker

# Set up cron job (in Supabase Dashboard -> Database -> Cron Jobs)
# Schedule: 0 9 * * * (Daily at 9 AM UTC)
# SQL: SELECT net.http_post(
#   url:='https://your-project.supabase.co/functions/v1/license-expiration-checker',
#   headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
# );
```

**What this does:**

- Checks for licenses expiring in 30, 14, 7, and 1 days
- Checks for expired licenses in grace period
- Sends email notifications automatically
- Records all notifications in database

**Optional:** Configure email service (Resend, SendGrid, etc.)

```typescript
// In index.ts, uncomment and configure email service integration
const resendApiKey = Deno.env.get("RESEND_API_KEY");
// ... email sending code
```

## Step 3: Update Dashboard

The dashboard files have already been updated with the necessary includes:

1. **dashboard.html** - Includes new CSS and JS files
2. **dashboard.js** - Initializes LicenseExpirationManager
3. **New files added:**
   - `js/license-expiration.js` - Main expiration management logic
   - `css/license-expiration.css` - Styling for banners and modals

**No additional changes needed** - the system will automatically:

- Check license status on dashboard load
- Show expiration banners when appropriate
- Handle renewal flow through modals

## Step 4: Update Paddle Webhook (Optional Enhancement)

To properly handle renewals vs new purchases, update the webhook:

```typescript
// In paddle-webhook/index.ts, after line 140 (in transaction.completed handler)

// Check if this is a renewal (from session storage on frontend)
const renewalInfo = custom_data?.renewal;

if (renewalInfo) {
  const { license_id, renewal_type } = renewalInfo;

  // Get existing license
  const { data: existingLicense } = await supabase
    .from("organization_licenses")
    .select("*")
    .eq("id", license_id)
    .single();

  if (existingLicense) {
    // Calculate new expiry based on renewal type
    let newExpiryDate;

    switch (renewal_type) {
      case "grace_period":
        // Extend from original expiry
        newExpiryDate = new Date(existingLicense.expires_at);
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
        break;

      case "early_renewal":
      case "standard":
      default:
        // Extend from now
        newExpiryDate = new Date();
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
        break;
    }

    // Update license
    await supabase
      .from("organization_licenses")
      .update({
        expires_at: newExpiryDate.toISOString(),
        total_licenses: quantity,
        last_renewal_date: new Date().toISOString(),
        grace_period_start: null, // Clear grace period
        grace_period_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", license_id);

    // Record renewal history
    await supabase.from("license_renewal_history").insert({
      organization_id: existingLicense.organization_id,
      license_id: license_id,
      previous_expiry: existingLicense.expires_at,
      new_expiry: newExpiryDate.toISOString(),
      licenses_count: quantity,
      previous_license_count: existingLicense.total_licenses,
      paddle_transaction_id: transactionId,
      renewal_type: renewal_type,
      renewed_by: userId,
    });
  }
}
```

## Step 5: Test the System

### Test Scenario 1: Expiring Soon Banner

```sql
-- Set a license to expire in 7 days
UPDATE organization_licenses
SET expires_at = NOW() + INTERVAL '7 days'
WHERE organization_id = 'your-test-org-id';
```

Then visit dashboard - you should see a critical warning banner.

### Test Scenario 2: Grace Period

```sql
-- Set a license as expired 10 days ago
UPDATE organization_licenses
SET expires_at = NOW() - INTERVAL '10 days',
    grace_period_start = NOW() - INTERVAL '10 days',
    grace_period_end = NOW() + INTERVAL '20 days'
WHERE organization_id = 'your-test-org-id';
```

Dashboard should show grace period warning with days remaining.

### Test Scenario 3: Renewal Flow

1. Click "Renew License" button in banner
2. Review renewal modal with current details
3. Choose to renew same count or add licenses
4. Click "Proceed to Payment"
5. Complete Paddle checkout (use test card)
6. Verify license extended in database

### Test Scenario 4: Email Notifications

```bash
# Manually trigger the edge function
curl -X POST \
  https://your-project.supabase.co/functions/v1/license-expiration-checker \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"

# Check notifications table
SELECT * FROM license_notifications ORDER BY sent_at DESC LIMIT 10;
```

## Step 6: Configure Email Service (Production)

For production email notifications, integrate with an email service:

### Option A: Resend (Recommended)

```typescript
// In license-expiration-checker/index.ts
const resendApiKey = Deno.env.get("RESEND_API_KEY");

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "MepSketcher <notifications@mepsketcher.com>",
    to: owner.email,
    subject: subject,
    html: htmlContent,
  }),
});
```

### Option B: SendGrid

```typescript
const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");

await fetch("https://api.sendgrid.com/v3/mail/send", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${sendgridApiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    personalizations: [
      {
        to: [{ email: owner.email }],
        subject: subject,
      },
    ],
    from: { email: "notifications@mepsketcher.com", name: "MepSketcher" },
    content: [{ type: "text/html", value: htmlContent }],
  }),
});
```

## Common Payment Scenarios Handled

### Scenario A: Standard Annual Renewal

- User clicks "Renew License" before expiry
- Selects same license count or adds more
- Pays via Paddle
- License extended 1 year from payment date
- ✅ **Handled automatically**

### Scenario B: Grace Period Renewal

- License expired 15 days ago (still in grace)
- User renews
- License extended 1 year from original expiry date
- Grace period cleared
- ✅ **Handled automatically**

### Scenario C: Adding Licenses Mid-Year

- User wants to add 5 more licenses
- Prorated pricing applied by Paddle
- All licenses expire on same date
- ✅ **Handled by existing webhook**

### Scenario D: Expired >30 Days

- License expired over 30 days
- Treated as new purchase
- New 1-year period starts from payment
- ✅ **Handled automatically**

### Scenario E: Trial to Paid

- 14-day trial expires
- User purchases licenses
- Trial organization converted to paid
- ✅ **Already handled by webhook**

## Monitoring & Maintenance

### Key Metrics to Monitor

```sql
-- Licenses expiring in next 30 days
SELECT
  o.name,
  ol.total_licenses,
  ol.expires_at,
  EXTRACT(DAY FROM (ol.expires_at - NOW())) as days_remaining
FROM organization_licenses ol
JOIN organizations o ON o.id = ol.organization_id
WHERE ol.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
ORDER BY ol.expires_at;

-- Licenses in grace period
SELECT
  o.name,
  ol.expires_at,
  ol.grace_period_end,
  EXTRACT(DAY FROM (ol.grace_period_end - NOW())) as grace_days_left
FROM organization_licenses ol
JOIN organizations o ON o.id = ol.organization_id
WHERE ol.grace_period_start IS NOT NULL
  AND ol.grace_period_end > NOW()
ORDER BY ol.grace_period_end;

-- Recent renewals
SELECT
  o.name,
  lrh.renewal_type,
  lrh.previous_expiry,
  lrh.new_expiry,
  lrh.licenses_count,
  lrh.renewed_at
FROM license_renewal_history lrh
JOIN organizations o ON o.id = lrh.organization_id
ORDER BY lrh.renewed_at DESC
LIMIT 20;

-- Notification effectiveness
SELECT
  notification_type,
  COUNT(*) as sent,
  SUM(CASE WHEN email_sent THEN 1 ELSE 0 END) as emails_sent,
  SUM(CASE WHEN dashboard_shown THEN 1 ELSE 0 END) as dashboard_shown
FROM license_notifications
WHERE sent_at > NOW() - INTERVAL '30 days'
GROUP BY notification_type;
```

### Cron Job Health Check

```sql
-- Check if cron job is running
SELECT * FROM cron.job WHERE jobname LIKE '%license%';

-- Check recent cron executions
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname LIKE '%license%')
ORDER BY start_time DESC LIMIT 10;
```

## Troubleshooting

### Issue: Banner not showing

**Check:**

1. Is LicenseExpirationManager initialized? Check browser console
2. Does license exist in database?
3. Is license actually expiring soon?
4. Check CSS file is loaded

**Debug:**

```javascript
// In browser console
licenseExpirationManager.getLicenseStatus();
```

### Issue: Email notifications not sending

**Check:**

1. Is edge function deployed?
2. Is cron job configured?
3. Are email service credentials set?
4. Check edge function logs

**Debug:**

```bash
supabase functions logs license-expiration-checker --tail
```

### Issue: Renewal not extending license

**Check:**

1. Is webhook receiving custom_data?
2. Is renewalInfo stored in sessionStorage?
3. Check webhook logs for errors

**Debug:**

```javascript
// Before clicking "Proceed to Payment"
console.log(sessionStorage.getItem("pendingRenewal"));
```

## Production Checklist

- [ ] Database migrations executed
- [ ] Edge function deployed
- [ ] Cron job configured (daily at 9 AM)
- [ ] Email service integrated and tested
- [ ] Dashboard updated and tested
- [ ] Webhook handles renewals correctly
- [ ] All test scenarios pass
- [ ] Monitoring queries set up
- [ ] Alert system configured for failed renewals
- [ ] Support team trained on renewal process
- [ ] Documentation updated

## Support Materials

### User Documentation

Create a support article explaining:

- When users receive expiration notifications
- How the grace period works
- How to renew licenses
- What happens if license expires

### Email to Send to Admins

```
Subject: License Expiration Reminders Now Active

Hi [Admin Name],

We've implemented automatic license expiration reminders for your MepSketcher account.

You'll now receive email notifications at:
- 30 days before expiry
- 14 days before expiry
- 7 days before expiry
- 1 day before expiry
- When license enters grace period

You'll also see reminders in your dashboard when you log in.

To renew your license at any time, simply:
1. Log in to your dashboard
2. Click "Renew License" in the banner or license card
3. Complete the payment process

Questions? Contact support@mepsketcher.com

Best regards,
The MepSketcher Team
```

## Next Steps

1. **Week 1:** Deploy to staging and test thoroughly
2. **Week 2:** Monitor staging for issues, collect feedback
3. **Week 3:** Deploy to production with monitoring
4. **Week 4:** Analyze first month's data, optimize email timing

## Additional Resources

- Full Documentation: [LICENSE_EXPIRATION_AND_RENEWAL_SYSTEM.md](LICENSE_EXPIRATION_AND_RENEWAL_SYSTEM.md)
- Database Schema: [DATABASE_LICENSE_EXPIRATION.sql](../DATABASE_LICENSE_EXPIRATION.sql)
- JavaScript API: [license-expiration.js](../js/license-expiration.js)
