# License Validation Logic - Application Layer

Since you're keeping all validation logic in the application layer rather than database functions, here's the core logic you need to implement in both JavaScript (dashboard) and C# (desktop app).

## Core Functions

### 1. Calculate Days Until Expiry

**JavaScript:**

```javascript
function daysUntilExpiry(expiryDate) {
  const expiry = new Date(expiryDate);
  const now = new Date();
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}
```

**C#:**

```csharp
public static int DaysUntilExpiry(DateTime expiryDate)
{
    var now = DateTime.UtcNow;
    return (int)Math.Ceiling((expiryDate - now).TotalDays);
}
```

### 2. Check If In Grace Period

Grace period = 30 days after expiry date

**JavaScript:**

```javascript
function isInGracePeriod(expiryDate) {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const thirtyDaysAfterExpiry = new Date(expiry);
  thirtyDaysAfterExpiry.setDate(thirtyDaysAfterExpiry.getDate() + 30);

  return expiry < now && now <= thirtyDaysAfterExpiry;
}
```

**C#:**

```csharp
public static bool IsInGracePeriod(DateTime expiryDate)
{
    var now = DateTime.UtcNow;
    var thirtyDaysAfterExpiry = expiryDate.AddDays(30);

    return expiryDate < now && now <= thirtyDaysAfterExpiry;
}
```

### 3. Get License Status

**JavaScript:**

```javascript
function getLicenseStatus(license) {
  if (!license) {
    return { status: "no_license", message: "No license found" };
  }

  const expiresAt = new Date(license.expires_at);
  const daysRemaining = daysUntilExpiry(expiresAt);
  const inGracePeriod = isInGracePeriod(expiresAt);

  // Expired >30 days
  if (daysRemaining < -30) {
    return {
      status: "expired",
      days_remaining: daysRemaining,
      severity: "critical",
      message: "License expired more than 30 days ago",
      action_required: true,
    };
  }

  // In grace period (0 to -30 days)
  if (inGracePeriod) {
    const graceDaysLeft = 30 + daysRemaining;
    return {
      status: "grace_period",
      days_remaining: daysRemaining,
      grace_days_left: graceDaysLeft,
      severity: "warning",
      message: `License expired. ${graceDaysLeft} days left in grace period`,
      action_required: true,
    };
  }

  // Just expired (today)
  if (daysRemaining === 0) {
    return {
      status: "just_expired",
      days_remaining: 0,
      severity: "critical",
      message: "License expired today",
      action_required: true,
    };
  }

  // Expiring soon (1-7 days)
  if (daysRemaining > 0 && daysRemaining <= 7) {
    return {
      status: "expiring_soon",
      days_remaining: daysRemaining,
      severity: "critical",
      message: `License expires in ${daysRemaining} days`,
      action_required: true,
    };
  }

  // Expiring (8-30 days)
  if (daysRemaining > 7 && daysRemaining <= 30) {
    return {
      status: "expiring_soon",
      days_remaining: daysRemaining,
      severity: "warning",
      message: `License expires in ${daysRemaining} days`,
      action_required: false,
    };
  }

  // Active (>30 days)
  return {
    status: "active",
    days_remaining: daysRemaining,
    severity: "info",
    message: "License is active",
    action_required: false,
  };
}
```

**C#:**

```csharp
public class LicenseStatus
{
    public string Status { get; set; }
    public int DaysRemaining { get; set; }
    public int? GraceDaysLeft { get; set; }
    public string Severity { get; set; }
    public string Message { get; set; }
    public bool ActionRequired { get; set; }
}

public static LicenseStatus GetLicenseStatus(OrganizationLicenseInfo license)
{
    if (license == null)
    {
        return new LicenseStatus
        {
            Status = "no_license",
            Message = "No license found"
        };
    }

    var daysRemaining = DaysUntilExpiry(license.ExpiresAt);
    var inGracePeriod = IsInGracePeriod(license.ExpiresAt);

    // Expired >30 days
    if (daysRemaining < -30)
    {
        return new LicenseStatus
        {
            Status = "expired",
            DaysRemaining = daysRemaining,
            Severity = "critical",
            Message = "License expired more than 30 days ago",
            ActionRequired = true
        };
    }

    // In grace period (0 to -30 days)
    if (inGracePeriod)
    {
        var graceDaysLeft = 30 + daysRemaining;
        return new LicenseStatus
        {
            Status = "grace_period",
            DaysRemaining = daysRemaining,
            GraceDaysLeft = graceDaysLeft,
            Severity = "warning",
            Message = $"License expired. {graceDaysLeft} days left in grace period",
            ActionRequired = true
        };
    }

    // Just expired (today)
    if (daysRemaining == 0)
    {
        return new LicenseStatus
        {
            Status = "just_expired",
            DaysRemaining = 0,
            Severity = "critical",
            Message = "License expired today",
            ActionRequired = true
        };
    }

    // Expiring soon (1-7 days)
    if (daysRemaining > 0 && daysRemaining <= 7)
    {
        return new LicenseStatus
        {
            Status = "expiring_soon",
            DaysRemaining = daysRemaining,
            Severity = "critical",
            Message = $"License expires in {daysRemaining} days",
            ActionRequired = true
        };
    }

    // Expiring (8-30 days)
    if (daysRemaining > 7 && daysRemaining <= 30)
    {
        return new LicenseStatus
        {
            Status = "expiring_soon",
            DaysRemaining = daysRemaining,
            Severity = "warning",
            Message = $"License expires in {daysRemaining} days",
            ActionRequired = false
        };
    }

    // Active (>30 days)
    return new LicenseStatus
    {
        Status = "active",
        DaysRemaining = daysRemaining,
        Severity = "info",
        Message = "License is active",
        ActionRequired = false
    };
}
```

## Database Queries

You'll need these queries to check licenses and notifications:

### Check If Notification Already Sent Today

**JavaScript (Supabase):**

```javascript
const { data } = await supabase
  .from("license_notifications")
  .select("id")
  .eq("license_id", licenseId)
  .eq("notification_type", "7_day")
  .gte("sent_at", new Date().toISOString().split("T")[0])
  .maybeSingle();

const alreadySent = !!data;
```

**C# (Supabase):**

```csharp
var today = DateTime.UtcNow.Date;
var result = await supabase
    .From<LicenseNotification>()
    .Where(x => x.LicenseId == licenseId)
    .Where(x => x.NotificationType == "7_day")
    .Where(x => x.SentAt >= today)
    .Single();

var alreadySent = result != null;
```

### Record Notification

**JavaScript:**

```javascript
await supabase.from("license_notifications").insert({
  organization_id: orgId,
  license_id: licenseId,
  notification_type: "7_day",
  dashboard_shown: true,
  email_sent: false,
});
```

**C#:**

```csharp
await supabase
    .From<LicenseNotification>()
    .Insert(new LicenseNotification
    {
        OrganizationId = orgId,
        LicenseId = licenseId,
        NotificationType = "7_day",
        DashboardShown = true,
        EmailSent = false
    });
```

### Record Renewal in History

**JavaScript:**

```javascript
await supabase.from("license_renewal_history").insert({
  organization_id: orgId,
  license_id: licenseId,
  previous_expiry: previousExpiryDate.toISOString(),
  new_expiry: newExpiryDate.toISOString(),
  licenses_count: totalLicenses,
  previous_license_count: oldLicenseCount,
  paddle_transaction_id: transactionId,
  renewal_type: "standard", // or 'grace_period', 'early_renewal', etc.
  renewed_by: userId,
});
```

### Update License After Renewal

**JavaScript:**

```javascript
await supabase
  .from("organization_licenses")
  .update({
    expires_at: newExpiryDate.toISOString(),
    grace_period_start: null,
    grace_period_end: null,
    last_renewal_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq("id", licenseId);
```

## Integration Points

### Dashboard (JavaScript)

✅ **Already updated** - `js/license-expiration.js` now uses client-side logic

### Desktop App (C#)

You can add the logic to `MEPSketcher2/Services/Licensing/LicenseGateService.cs`:

```csharp
public class LicenseExpirationChecker
{
    public static int DaysUntilExpiry(DateTime expiryDate) { /* ... */ }
    public static bool IsInGracePeriod(DateTime expiryDate) { /* ... */ }
    public static LicenseStatus GetLicenseStatus(OrganizationLicenseInfo license) { /* ... */ }
}
```

### Edge Function (TypeScript)

✅ **Already updated** - `supabase/functions/license-expiration-checker/index.ts` now includes helper functions

## Testing

Test the logic with these scenarios:

```javascript
// Test data
const testLicense = {
  expires_at: "2026-01-28T00:00:00Z", // 7 days from now
};

const status = getLicenseStatus(testLicense);
console.log(status);
// Expected: { status: 'expiring_soon', days_remaining: 7, severity: 'critical', ... }
```

## Benefits of Application-Layer Logic

✅ **Easier to debug** - Standard JavaScript/C# debugging
✅ **Easier to test** - Unit tests without database
✅ **More portable** - Logic can be reused across projects
✅ **No database functions** - Simpler database schema
✅ **Same results** - Identical behavior to database functions

## Complete Example: Check License on Dashboard Load

```javascript
async function checkLicenseOnLoad() {
  // 1. Load license from database
  const { data: license } = await supabase
    .from("organization_licenses")
    .select("*")
    .eq("organization_id", currentOrgId)
    .single();

  // 2. Calculate status (client-side)
  const status = getLicenseStatus(license);

  // 3. Show banner if needed
  if (status.action_required) {
    showExpirationBanner(status);

    // 4. Record that banner was shown
    await supabase.from("license_notifications").insert({
      organization_id: currentOrgId,
      license_id: license.id,
      notification_type: getNotificationType(status.days_remaining),
      dashboard_shown: true,
    });
  }
}

function getNotificationType(daysRemaining) {
  if (daysRemaining <= 1 && daysRemaining >= 0) return "1_day";
  if (daysRemaining <= 7) return "7_day";
  if (daysRemaining <= 14) return "14_day";
  if (daysRemaining <= 30) return "30_day";
  if (daysRemaining < 0) return "expired";
  return null;
}
```

This approach keeps everything in your application code where it's easier to maintain and test!
