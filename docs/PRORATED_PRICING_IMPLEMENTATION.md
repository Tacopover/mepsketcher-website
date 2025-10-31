# Prorated Pricing Implementation Summary

## Overview

Implemented automatic prorated pricing for users who purchase additional licenses before their current license expires.

## How It Works

### 1. Frontend Purchase Flow (`js/paddle.js`)

When a user clicks "Buy Yearly License":

1. **Checks for existing licenses** in the database
2. **If licenses exist and haven't expired**:
   - Calculates remaining days until expiry
   - Calls `create-custom-price` edge function to generate prorated Paddle price
   - Uses the custom price ID for checkout
3. **If no licenses or expired**:
   - Uses standard yearly price

### 2. Custom Price Creation (`supabase/functions/create-custom-price/index.ts`)

- Validates user is an admin of the organization
- Calculates prorated price: `(basePrice / 365) × remainingDays × quantity`
- Creates a one-time custom price in Paddle
- Returns the custom price ID to use in checkout

### 3. Webhook Processing (`supabase/functions/paddle-webhook/index.ts`)

When Paddle webhook receives `transaction.completed`:

- Checks if purchase is prorated (via `custom_data.prorated` flag)
- **If prorated**: Adds licenses but keeps existing expiry date
- **If not prorated**: Adds licenses and extends expiry by 1 year

### 4. Dashboard UI (`js/dashboard.js`)

When admin clicks "Buy More Licenses":

- Prompts for quantity
- Shows estimated prorated cost
- Passes quantity to purchase function

## Configuration Requirements

### Supabase Edge Function Secrets

Ensure these are set in Supabase Dashboard → Edge Functions → Secrets:

1. **`PADDLE_WEBHOOK_SECRET`**: From Paddle Dashboard → Developer Tools → Notifications
2. **`PADDLE_API_KEY`**: From Paddle Dashboard → Developer Tools → Authentication
3. **`PADDLE_PRODUCT_ID`**: Your MepSketcher product ID (e.g., `pro_01k6z965mp0mq1sj80q4sczjah`)
4. **`PADDLE_ENVIRONMENT`**: Either "production" or "sandbox"

### Paddle Configuration

1. **Webhook Endpoint**: Must be set to public access

   - URL: `https://your-project.supabase.co/functions/v1/paddle-webhook`
   - Events: `transaction.completed`, `subscription.updated`, `subscription.canceled`

2. **Base Price**: Currently hardcoded as $200/year in `create-custom-price/index.ts`
   - Modify `YEARLY_LICENSE_PRICE` if different

## Testing Steps

### Test 1: First-Time Purchase (No Prorated)

1. Sign up as new user
2. Click "Buy Yearly License"
3. Complete purchase
4. **Expected**:
   - License created with 1 year expiry
   - Organization marked as non-trial
   - User added to organization_members

### Test 2: Additional License Purchase (Prorated)

1. Log in as user with existing licenses
2. Click "Buy More Licenses"
3. Enter quantity (e.g., 2)
4. **Expected**:
   - See confirmation with prorated price calculation
   - Paddle checkout shows custom price
   - After purchase: total_licenses increases
   - Expiry date remains the same (not extended)

### Test 3: Purchase After Expiry (No Prorated)

1. Log in as user with expired licenses
2. Click "Buy Yearly License"
3. **Expected**:
   - Uses standard price (not prorated)
   - Expiry set to 1 year from now

## Database Changes

### Custom Data Fields

The webhook now processes these additional `custom_data` fields:

- `quantity`: Number of licenses purchased
- `prorated`: Boolean flag indicating prorated purchase
- `remainingDays`: Days remaining on current license
- `proratedAmount`: Calculated prorated price

### organization_licenses Updates

- **Prorated purchases**: Increments `total_licenses`, keeps `expires_at`
- **Regular purchases**: Increments `total_licenses`, sets new `expires_at`

## Price Calculation Example

**Scenario**: User has 5 licenses expiring in 180 days, wants to buy 3 more

```
Base yearly price: $200
Daily rate: $200 / 365 = $0.548
Remaining days: 180
Additional licenses: 3

Prorated price = $0.548 × 180 × 3 = $296.40
```

The user pays $296.40 for 3 licenses valid for 180 days (until current expiry).

## Code Files Modified

1. **`js/paddle.js`**:

   - Added `quantity` parameter to `purchaseYearlyLicense()`
   - Added logic to check existing licenses and call custom price creation
   - Updated global wrapper function

2. **`js/dashboard.js`**:

   - Updated `handleBuyMoreLicenses()` to prompt for quantity
   - Added prorated cost preview in confirmation dialog

3. **`supabase/functions/paddle-webhook/index.ts`**:

   - Added prorated purchase detection
   - Conditional expiry date handling based on prorated flag

4. **`supabase/functions/create-custom-price/index.ts`**:
   - Already implemented (no changes needed)

## Deployment Steps

1. **Deploy edge functions**:

   ```bash
   supabase functions deploy paddle-webhook
   supabase functions deploy create-custom-price
   ```

2. **Set environment variables** in Supabase Dashboard

3. **Test with Paddle sandbox** before production

4. **Monitor webhook logs** in Supabase Dashboard → Edge Functions → paddle-webhook → Logs

## Troubleshooting

### "Failed to create prorated price"

- Check `PADDLE_API_KEY` is set correctly
- Verify `PADDLE_PRODUCT_ID` is valid
- Check Supabase logs for detailed error

### License expiry not preserved on prorated purchase

- Check `custom_data.prorated` is being set in paddle.js
- Verify webhook is receiving the prorated flag
- Check webhook logs for "Prorated purchase" message

### Custom price creation fails

- Ensure user is an admin of the organization
- Verify remaining days is positive (license not expired)
- Check Paddle API response in edge function logs

## Future Enhancements

1. **Multiple license types**: Support different pricing tiers
2. **Bulk discounts**: Apply discounts for large quantity purchases
3. **Renewal reminders**: Email users before license expiry
4. **Subscription model**: Convert to recurring subscriptions instead of one-time purchases
5. **Credit system**: Allow unused time to be credited toward new purchases
