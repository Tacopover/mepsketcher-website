# License Expiration & Renewal System

## Overview

This document outlines the implementation of the license expiration alert and renewal system for MepSketcher, covering all payment scenarios and user types.

## System Components

### 1. **Database Schema Extensions**

- License expiration notifications table
- Email notification tracking
- Renewal history

### 2. **Notification System**

- Email alerts at 30 days, 14 days, 7 days, and 1 day before expiry
- In-app dashboard notifications
- Desktop application alerts

### 3. **Renewal Flow**

- Self-service renewal via dashboard
- Automatic license extension
- Prorated pricing for early renewal
- Grace period handling

### 4. **Payment Scenarios**

#### Scenario A: Standard Annual License (Most Common)

- **Description**: Organization purchased X licenses for 1 year via Paddle
- **Expiration Behavior**: All licenses expire on the same date
- **Renewal Process**: Owner renews all licenses for another year
- **Payment**: Full annual price via Paddle checkout

#### Scenario B: Mid-Year License Addition

- **Description**: Organization buys additional licenses mid-year
- **Expiration Behavior**: New licenses expire on the same date as existing ones (prorated purchase)
- **Renewal Process**: All licenses renew together at original expiry date
- **Payment**: Prorated price for remaining days

#### Scenario C: Grace Period Usage

- **Description**: License expired but still within 30-day grace period
- **Expiration Behavior**: Limited functionality, warning banners
- **Renewal Process**: Renew to restore full access
- **Payment**: Full annual price

#### Scenario D: Expired License (>30 Days)

- **Description**: License expired over 30 days ago
- **Expiration Behavior**: Access blocked, data preserved
- **Renewal Process**: Treated as new purchase
- **Payment**: Full annual price, new expiry date from renewal

#### Scenario E: Trial to Paid Conversion

- **Description**: Trial organization upgrading to paid
- **Expiration Behavior**: Trial expires after 14 days
- **Renewal Process**: First payment converts to paid license
- **Payment**: Full annual price for X licenses

#### Scenario F: Subscription Model (Future Enhancement)

- **Description**: Monthly or annual recurring subscription via Paddle
- **Expiration Behavior**: Auto-renewal unless cancelled
- **Renewal Process**: Automatic via Paddle subscription
- **Payment**: Recurring charge handled by Paddle

## Implementation Details

### Database Migrations

```sql
-- Add license notification tracking
CREATE TABLE IF NOT EXISTS license_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    license_id text NOT NULL REFERENCES organization_licenses(id) ON DELETE CASCADE,
    notification_type text NOT NULL, -- '30_day', '14_day', '7_day', '1_day', 'expired'
    sent_at timestamp with time zone NOT NULL DEFAULT NOW(),
    email_sent boolean DEFAULT false,
    dashboard_shown boolean DEFAULT false,
    desktop_shown boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_license_notifications_org ON license_notifications(organization_id);
CREATE INDEX idx_license_notifications_license ON license_notifications(license_id);
CREATE INDEX idx_license_notifications_type ON license_notifications(notification_type);

-- Add grace period tracking
ALTER TABLE organization_licenses
ADD COLUMN IF NOT EXISTS grace_period_start timestamp with time zone,
ADD COLUMN IF NOT EXISTS grace_period_end timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_renewal_date timestamp with time zone;

-- Add renewal history
CREATE TABLE IF NOT EXISTS license_renewal_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    license_id text NOT NULL REFERENCES organization_licenses(id) ON DELETE CASCADE,
    previous_expiry timestamp with time zone NOT NULL,
    new_expiry timestamp with time zone NOT NULL,
    licenses_count integer NOT NULL,
    amount_paid decimal(10,2),
    paddle_transaction_id text,
    renewal_type text NOT NULL, -- 'standard', 'grace_period', 'new_purchase', 'prorated'
    renewed_at timestamp with time zone NOT NULL DEFAULT NOW(),
    created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_renewal_history_org ON license_renewal_history(organization_id);
CREATE INDEX idx_renewal_history_license ON license_renewal_history(license_id);
```

### Dashboard Notification UI

```javascript
// Check for expiring licenses and show banners
async function checkLicenseExpiration() {
  const { data: licenses } = await supabase
    .from("organization_licenses")
    .select("*")
    .eq("organization_id", currentOrgId);

  if (!licenses || licenses.length === 0) return;

  const license = licenses[0];
  const expiresAt = new Date(license.expires_at);
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

  // Show appropriate banner
  if (daysUntilExpiry < 0) {
    showExpiredBanner(license);
  } else if (daysUntilExpiry <= 30) {
    showExpiringBanner(license, daysUntilExpiry);
  }
}

function showExpiringBanner(license, daysRemaining) {
  const severity =
    daysRemaining <= 7 ? "critical" : daysRemaining <= 14 ? "warning" : "info";

  const banner = document.createElement("div");
  banner.className = `expiration-banner ${severity}`;
  banner.innerHTML = `
        <div class="banner-content">
            <span class="banner-icon">⚠️</span>
            <div class="banner-text">
                <strong>Your license expires in ${daysRemaining} days</strong>
                <p>Renew now to ensure uninterrupted access to MepSketcher</p>
            </div>
            <button class="btn btn-primary" onclick="openRenewalFlow()">
                Renew License
            </button>
        </div>
    `;

  document.querySelector(".dashboard-content").prepend(banner);
}

function showExpiredBanner(license) {
  const now = new Date();
  const expiresAt = new Date(license.expires_at);
  const daysExpired = Math.ceil((now - expiresAt) / (1000 * 60 * 60 * 24));
  const inGracePeriod = daysExpired <= 30;

  const banner = document.createElement("div");
  banner.className = "expiration-banner expired";
  banner.innerHTML = `
        <div class="banner-content">
            <span class="banner-icon">🚫</span>
            <div class="banner-text">
                <strong>${inGracePeriod ? "Your license has expired" : "Your license expired over 30 days ago"}</strong>
                <p>${
                  inGracePeriod
                    ? `You have ${30 - daysExpired} days remaining in your grace period`
                    : "Your access has been suspended. Renew to restore access."
                }</p>
            </div>
            <button class="btn btn-danger" onclick="openRenewalFlow()">
                Renew Now
            </button>
        </div>
    `;

  document.querySelector(".dashboard-content").prepend(banner);
}
```

### Renewal Flow Implementation

```javascript
async function openRenewalFlow() {
  const user = authService.getCurrentUser();
  const { data: licenses } = await authService.supabase
    .from("organization_licenses")
    .select("*")
    .eq("organization_id", currentOrgId)
    .single();

  if (!licenses) {
    alert("No license found");
    return;
  }

  const expiresAt = new Date(licenses.expires_at);
  const now = new Date();
  const isExpired = expiresAt < now;
  const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

  // Calculate pricing
  let renewalType = "standard";
  let price = licenses.total_licenses * 200; // $200 per license per year

  if (!isExpired && daysUntilExpiry > 0 && daysUntilExpiry < 365) {
    // Early renewal - option to extend or wait
    const extendNow = confirm(
      `Your license expires in ${daysUntilExpiry} days.\n\n` +
        `Option 1: Renew now and extend expiry by 1 year from today\n` +
        `Option 2: Wait until closer to expiry\n\n` +
        `Click OK to renew now, or Cancel to wait.`,
    );

    if (!extendNow) return;
    renewalType = "early_renewal";
  } else if (isExpired) {
    const daysExpired = Math.abs(daysUntilExpiry);
    if (daysExpired <= 30) {
      renewalType = "grace_period";
    } else {
      renewalType = "new_purchase";
    }
  }

  // Show renewal modal
  showRenewalModal(licenses, renewalType, price);
}

function showRenewalModal(license, renewalType, price) {
  const modal = document.createElement("div");
  modal.className = "modal renewal-modal";
  modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Renew Your License</h2>
                <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="renewal-summary">
                    <h3>Renewal Summary</h3>
                    <div class="summary-row">
                        <span>License Count:</span>
                        <span>${license.total_licenses} licenses</span>
                    </div>
                    <div class="summary-row">
                        <span>Current Expiry:</span>
                        <span>${new Date(license.expires_at).toLocaleDateString()}</span>
                    </div>
                    <div class="summary-row">
                        <span>New Expiry:</span>
                        <span>${getNewExpiryDate(license, renewalType).toLocaleDateString()}</span>
                    </div>
                    <div class="summary-row total">
                        <span><strong>Total:</strong></span>
                        <span><strong>$${price.toFixed(2)}</strong></span>
                    </div>
                </div>
                
                <div class="renewal-options">
                    <h4>Renewal Options</h4>
                    <label>
                        <input type="radio" name="renewal-option" value="same" checked>
                        Renew existing ${license.total_licenses} licenses ($${price.toFixed(2)})
                    </label>
                    <label>
                        <input type="radio" name="renewal-option" value="add">
                        Add more licenses
                        <input type="number" id="additionalLicenses" min="1" max="1000" value="5" style="width: 80px; margin-left: 10px;">
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="processRenewal('${license.id}', '${renewalType}')">
                    Proceed to Payment
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
}

function getNewExpiryDate(license, renewalType) {
  const now = new Date();
  const currentExpiry = new Date(license.expires_at);

  switch (renewalType) {
    case "standard":
    case "new_purchase":
      // 1 year from now
      return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    case "grace_period":
      // 1 year from original expiry
      return new Date(
        currentExpiry.getFullYear() + 1,
        currentExpiry.getMonth(),
        currentExpiry.getDate(),
      );

    case "early_renewal":
      // 1 year from now (not extending current period)
      return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    default:
      return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  }
}

async function processRenewal(licenseId, renewalType) {
  const option = document.querySelector(
    'input[name="renewal-option"]:checked',
  ).value;
  const additionalLicenses =
    option === "add"
      ? parseInt(document.getElementById("additionalLicenses").value)
      : 0;

  const { data: license } = await authService.supabase
    .from("organization_licenses")
    .select("*")
    .eq("id", licenseId)
    .single();

  if (!license) {
    alert("License not found");
    return;
  }

  const totalLicenses = license.total_licenses + additionalLicenses;

  // Store renewal info for webhook processing
  sessionStorage.setItem(
    "pendingRenewal",
    JSON.stringify({
      licenseId,
      renewalType,
      totalLicenses,
      originalLicenses: license.total_licenses,
      additionalLicenses,
    }),
  );

  // Open Paddle checkout
  if (typeof mepSketcherLicensing === "undefined") {
    alert("Payment system not available");
    return;
  }

  mepSketcherLicensing.purchaseYearlyLicense(totalLicenses);

  // Close modal
  document.querySelector(".renewal-modal").remove();
}
```

### Desktop Application Integration

Add to `MEPSketcher2/Services/Licensing/LicenseGateService.cs`:

```csharp
public async Task<LicenseExpirationWarning> CheckLicenseExpirationAsync()
{
    var licenses = await _managementService.GetUserLicensesAsync();

    if (licenses == null || !licenses.Any())
        return null;

    var license = licenses.First();
    var daysUntilExpiry = (license.ExpiresAt - DateTime.UtcNow).Days;

    if (daysUntilExpiry < 0)
    {
        var daysExpired = Math.Abs(daysUntilExpiry);
        var inGracePeriod = daysExpired <= 30;

        return new LicenseExpirationWarning
        {
            IsExpired = true,
            DaysUntilExpiry = daysUntilExpiry,
            InGracePeriod = inGracePeriod,
            Message = inGracePeriod
                ? $"Your license expired {daysExpired} days ago. You have {30 - daysExpired} days remaining in your grace period."
                : "Your license has expired. Please renew at mepsketcher.com/dashboard",
            Severity = inGracePeriod ? WarningSeverity.Warning : WarningSeverity.Critical
        };
    }

    if (daysUntilExpiry <= 30)
    {
        return new LicenseExpirationWarning
        {
            IsExpired = false,
            DaysUntilExpiry = daysUntilExpiry,
            Message = $"Your license expires in {daysUntilExpiry} days. Please renew at mepsketcher.com/dashboard",
            Severity = daysUntilExpiry <= 7 ? WarningSeverity.Critical :
                       daysUntilExpiry <= 14 ? WarningSeverity.Warning :
                       WarningSeverity.Info
        };
    }

    return null;
}

public class LicenseExpirationWarning
{
    public bool IsExpired { get; set; }
    public int DaysUntilExpiry { get; set; }
    public bool InGracePeriod { get; set; }
    public string Message { get; set; }
    public WarningSeverity Severity { get; set; }
}

public enum WarningSeverity
{
    Info,
    Warning,
    Critical
}
```

### Email Notification System

Create Supabase Edge Function: `license-expiration-checker`

```typescript
// Run daily via cron job
import { createClient } from "@supabase/supabase-js";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get licenses expiring in 30, 14, 7, or 1 days
  const targetDates = [30, 14, 7, 1];

  for (const days of targetDates) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    const { data: expiringLicenses } = await supabase
      .from("organization_licenses")
      .select(
        `
        *,
        organizations(*)
      `,
      )
      .gte("expires_at", targetDate.toISOString().split("T")[0])
      .lt(
        "expires_at",
        new Date(targetDate.getTime() + 86400000).toISOString().split("T")[0],
      );

    for (const license of expiringLicenses || []) {
      // Check if notification already sent
      const { data: existing } = await supabase
        .from("license_notifications")
        .select("id")
        .eq("license_id", license.id)
        .eq("notification_type", `${days}_day`)
        .maybeSingle();

      if (!existing) {
        // Send email notification
        await sendExpirationEmail(license, days);

        // Record notification
        await supabase.from("license_notifications").insert({
          organization_id: license.organization_id,
          license_id: license.id,
          notification_type: `${days}_day`,
          email_sent: true,
        });
      }
    }
  }

  return new Response("OK", { status: 200 });
});

async function sendExpirationEmail(license: any, daysUntilExpiry: number) {
  // Implementation using SendGrid, Resend, or Supabase Auth email
  // Template should include:
  // - Days until expiry
  // - License count
  // - Renewal link
  // - Organization name
}
```

### Webhook Enhancement

Update `paddle-webhook/index.ts` to handle renewals:

```typescript
// In transaction.completed handler
const renewalInfo = transactionData.custom_data?.renewal;

if (renewalInfo) {
  // This is a renewal
  const { license_id, renewal_type } = renewalInfo;

  // Update existing license
  const { data: existingLicense } = await supabase
    .from("organization_licenses")
    .select("*")
    .eq("id", license_id)
    .single();

  if (existingLicense) {
    let newExpiryDate;

    switch (renewal_type) {
      case "grace_period":
        // Extend from original expiry
        newExpiryDate = new Date(existingLicense.expires_at);
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
        break;

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
      paddle_transaction_id: transactionId,
      renewal_type: renewal_type,
    });
  }
}
```

## Testing Scenarios

### Test 1: Standard Renewal

1. Create organization with license expiring in 5 days
2. Verify expiration banner appears in dashboard
3. Click "Renew License"
4. Complete Paddle checkout
5. Verify license extended by 1 year
6. Verify renewal history recorded

### Test 2: Grace Period Renewal

1. Create license expired 15 days ago
2. Verify grace period banner shows
3. Renew license
4. Verify expiry is 1 year from original expiry date

### Test 3: Mid-Year Addition

1. Purchase 5 licenses expiring in 180 days
2. Add 5 more licenses
3. Verify all 10 licenses expire on same date
4. Verify prorated pricing applied

### Test 4: Email Notifications

1. Create license expiring in 30 days
2. Run cron job
3. Verify email sent
4. Verify notification recorded
5. Run again, verify no duplicate email

## Deployment Checklist

- [ ] Run database migrations
- [ ] Deploy updated paddle-webhook function
- [ ] Deploy license-expiration-checker function
- [ ] Set up cron job for daily checks
- [ ] Update dashboard.js with new functions
- [ ] Update desktop app with expiration checks
- [ ] Configure email templates
- [ ] Test all payment scenarios
- [ ] Monitor webhook logs
- [ ] Set up alerting for failed renewals

## Support Considerations

### FAQ for Users

**Q: What happens when my license expires?**
A: You have a 30-day grace period with limited functionality. After 30 days, access is suspended but your data is preserved.

**Q: Can I add licenses mid-year?**
A: Yes, additional licenses will be prorated to match your existing expiry date.

**Q: What if I forget to renew?**
A: You'll receive email reminders at 30, 14, 7, and 1 days before expiry. After expiry, you have a 30-day grace period.

**Q: Can I renew early?**
A: Yes, you can renew anytime. Your new expiry will be 1 year from the renewal date.

**Q: What happens to my team members when license expires?**
A: All members lose access during grace period. After renewal, access is automatically restored.

## Future Enhancements

1. **Auto-renewal subscriptions** - Implement Paddle subscriptions for automatic renewal
2. **Payment reminders** - Send reminders if payment fails
3. **Usage analytics** - Show license usage trends before renewal
4. **Multi-year discounts** - Offer discounts for 2-3 year purchases
5. **Flexible expiry** - Allow staggered expiry dates for different license pools
