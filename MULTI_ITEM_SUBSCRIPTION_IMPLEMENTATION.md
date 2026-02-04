# Multi-Item Subscription Implementation - Complete Guide

## Overview

This implementation replaces the custom price creation system with Paddle's native multi-item subscriptions for adding additional licenses to an organization's subscription.

**Key Benefits:**

- ✅ Simpler backend (no more custom price math)
- ✅ Automatic proration via Paddle
- ✅ Single renewal date for all licenses (all items in subscription share next_billed_at)
- ✅ Built-in Paddle audit trail
- ✅ Faster checkout experience (no need to create prices in advance)

---

## Files Changed

### 1. **New Edge Function: `add-subscription-items`**

**File:** `supabase/functions/add-subscription-items/index.ts`

**What it does:**

- Takes an organization's existing subscription ID
- Adds additional licenses as new line items to that subscription
- Uses `proration_billing_mode: "prorated_immediately"` to charge/credit right away
- Updates database to reflect new total license count
- Keeps subscription's `next_billed_at` unchanged (all items renew together)

**Called from:** Frontend (dashboard or purchase flow)

**Request format:**

```typescript
{
  organizationId: string; // Organization making the purchase
  subscriptionId: string; // Paddle subscription to add items to
  quantity: number; // How many additional licenses
}
```

**Response:**

```typescript
{
  success: true;
  subscriptionId: string;
  additionalLicenses: number;
  totalLicenses: number;
  nextBilledAt: string; // When all licenses will renew
  message: string; // User-friendly message
}
```

---

### 2. **Updated Webhook: `paddle-webhook/index.ts`**

**Changes to `transaction.completed` handler:**

- Now extracts and stores `subscription_id` from Paddle transaction
- When creating/updating licenses, saves the subscription_id to database

**New handler: `subscription.updated`**

- Triggered whenever items are added to a subscription
- Recalculates total licenses by summing all item quantities
- Updates organization_licenses table with new total

---

### 3. **Updated Frontend: `js/paddle.js`**

**Changes to `purchaseYearlyLicense()` method:**

**Old flow:**

1. Check if license exists and hasn't expired
2. Calculate remaining days
3. Call `create-custom-price` to generate prorated price
4. Open Paddle checkout with custom price

**New flow:**

1. Check if license exists and hasn't expired
2. **Check if license has a subscription_id**
3. **If yes: Call `add-subscription-items` directly (no checkout needed)**
   - Returns success message and updated renewal date
   - No payment form shown (proration handled by Paddle)
4. **If no: Proceed with standard Paddle checkout**

**Key changes:**

```javascript
// NEW: Direct subscription update flow
if (existingLicense && existingLicense.subscription_id && !expired) {
  // Call add-subscription-items
  // Show success message
  // Reload licenses
  return; // Don't open checkout
}

// FALLBACK: Standard checkout for new purchases
// Open Paddle checkout as before
```

---

### 4. **Database Migration: `DATABASE_ADD_SUBSCRIPTION_ID.sql`**

**New column:** `organization_licenses.subscription_id`

- Type: `text`
- Tracks which Paddle subscription owns the licenses
- Indexed for fast lookups

**Run this in Supabase SQL editor:**

```sql
ALTER TABLE organization_licenses
ADD COLUMN IF NOT EXISTS subscription_id text;

CREATE INDEX IF NOT EXISTS idx_organization_licenses_subscription_id
ON organization_licenses(subscription_id);
```

---

## Implementation Steps

### Step 1: Update Database

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `DATABASE_ADD_SUBSCRIPTION_ID.sql`
3. Run the migration

### Step 2: Deploy Edge Functions

```bash
# Deploy the new function
supabase functions deploy add-subscription-items

# Deploy the updated webhook
supabase functions deploy paddle-webhook
```

### Step 3: Update Frontend

- `js/paddle.js` is already updated with new logic
- No additional changes needed

### Step 4: Configure Paddle Webhooks

In Paddle Dashboard → Developer Tools → Notifications:

Make sure these events are enabled:

- ✅ `transaction.completed` (existing)
- ✅ `subscription.updated` (add if not already enabled)

Webhook URL should be: `https://YOUR_PROJECT.supabase.co/functions/v1/paddle-webhook`

---

## How It Works: Step-by-Step

### Scenario: User wants to add 5 more licenses to their existing subscription

1. **User clicks "Buy Additional Licenses"**
   - Frontend calls `purchaseYearlyLicense(quantity: 5)`

2. **Check existing subscription**
   - Query `organization_licenses` for org's current subscription
   - Find `subscription_id` from existing license

3. **Call `add-subscription-items`**
   - Fetch subscription details from Paddle
   - Get current items and their price IDs
   - Add new item: same price, quantity=5
   - Send to Paddle: `PATCH /subscriptions/{id}` with all items + `proration_billing_mode: "prorated_immediately"`

4. **Paddle processes the update**
   - Calculates pro-rated charge for 5 licenses × remaining days
   - Charges/credits the customer's payment method immediately
   - Updates subscription with new items
   - **Important:** `next_billed_at` stays the same - all items renew together

5. **Webhook receives `subscription.updated` event**
   - Extracts subscription ID and new item quantities
   - Recalculates: total_licenses = sum of all item quantities
   - Updates `organization_licenses.total_licenses`

6. **Frontend shows success**
   - Display renewal date: "All {X} licenses will renew on {date}"
   - Update dashboard with new license count

---

## Key Differences from Old System

| Aspect              | Old System (Custom Price)                 | New System (Multi-Item)            |
| ------------------- | ----------------------------------------- | ---------------------------------- |
| **How it works**    | Create one-time custom price per purchase | Add items to existing subscription |
| **Proration**       | Manual calculation in edge function       | Automatic via Paddle               |
| **Renewal date**    | Custom price expires, licenses separate   | All items share same renewal date  |
| **API calls**       | POST /prices → POST /checkout             | PATCH /subscriptions               |
| **Checkout**        | Always opens Paddle checkout form         | Instant if subscription exists     |
| **User experience** | See checkout form, longer flow            | Instant charge, quick confirmation |

---

## Testing Checklist

- [ ] Database migration applied successfully
- [ ] Both edge functions deployed
- [ ] Paddle webhooks configured for `subscription.updated`
- [ ] User with existing subscription adds more licenses
  - [ ] No checkout shown
  - [ ] Customer charged immediately
  - [ ] Dashboard shows updated license count
  - [ ] Renewal date unchanged
- [ ] Webhook logs show `subscription.updated` event
- [ ] Database `total_licenses` updated correctly
- [ ] New user (no subscription) purchases licenses normally
  - [ ] Checkout shown
  - [ ] License created with subscription_id

---

## Fallback: Using Old System

If you need to revert to custom price system (not recommended):

- Keep `create-custom-price` edge function deployed
- Comment out the new subscription.updated handler
- Revert changes to `paddle.js` purchaseYearlyLicense method

---

## Monitoring

### Check Subscription Updates

```sql
-- Find licenses with subscription_ids
SELECT
  ol.organization_id,
  ol.subscription_id,
  ol.total_licenses,
  ol.expires_at
FROM organization_licenses ol
WHERE ol.subscription_id IS NOT NULL
ORDER BY ol.updated_at DESC;
```

### Check Webhook Events

- Supabase Dashboard → Edge Functions → paddle-webhook → Logs
- Look for: `Processing subscription update for sub_...`

### Verify Paddle Subscription

- Paddle Dashboard → Customers → Find customer
- View subscription → Items list
- Should show multiple items with correct quantities

---

## Future Enhancements

1. **UI for managing licenses within subscription**
   - Remove licenses (decrease quantity)
   - View per-item pricing breakdown
   - Edit quantities directly

2. **License assignment improvements**
   - Show unassigned licenses from new items
   - Quick-add users with new licenses

3. **Advanced billing**
   - Different pricing tiers for different products
   - Bulk discounts for large additions
   - Credit system for unused time

---

## Support

If issues arise:

1. Check Supabase logs (Functions → paddle-webhook)
2. Check Paddle logs (Developer Tools → Event Log)
3. Verify webhook is receiving events
4. Ensure subscription_id is being saved in database
