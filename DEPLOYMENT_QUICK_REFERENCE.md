# Multi-Item Subscription - Quick Deployment Guide

## Pre-Deployment Checklist

- [ ] Review `MULTI_ITEM_SUBSCRIPTION_IMPLEMENTATION.md`
- [ ] All files are in sandbox environment (testing only)
- [ ] Database backup created
- [ ] Team notified

---

## Deployment Steps (5 minutes)

### 1. Database Migration (1 minute)

```bash
# Open Supabase Dashboard
# Go to SQL Editor
# Copy and paste contents of DATABASE_ADD_SUBSCRIPTION_ID.sql
# Click "Run"
```

Expected output: `success`

### 2. Deploy Edge Functions (2 minutes)

```bash
# From project root
cd supabase/functions

# Deploy new function
supabase functions deploy add-subscription-items

# Deploy updated webhook
supabase functions deploy paddle-webhook
```

### 3. Verify Paddle Configuration (1 minute)

1. Go to Paddle Dashboard
2. Developer Tools → Notifications
3. Check that `subscription.updated` is in your webhook events list
4. Webhook URL should be: `https://YOUR_PROJECT.supabase.co/functions/v1/paddle-webhook`

### 4. Frontend Already Updated (0 minutes)

- `js/paddle.js` already contains new logic
- No frontend deployment needed (already in repo)

---

## Testing (5 minutes)

### Quick Test

1. Go to dashboard
2. Log in with test account that has existing subscription
3. Click "Buy Additional Licenses"
4. Should see instant success message (no checkout form)
5. Check Supabase logs for webhook events

### Full Test Checklist

- [ ] User with subscription adds licenses → no checkout
- [ ] Check Supabase logs for `subscription.updated` event
- [ ] Check `organization_licenses.total_licenses` updated
- [ ] New user purchases licenses → checkout shown normally
- [ ] Renewal date unchanged after adding licenses

---

## Rollback Plan

If something goes wrong:

**Option 1: Revert to Custom Price System** (5 minutes)

```bash
# Revert paddle.js to use create-custom-price
git revert [commit-hash]
# Comment out subscription.updated handler in paddle-webhook
# Redeploy paddle-webhook
```

**Option 2: Database Rollback** (2 minutes)

```sql
-- Remove the new column
ALTER TABLE organization_licenses DROP COLUMN subscription_id;
```

---

## What You'll See

### Success Flow

1. User clicks "Buy Additional Licenses" for existing subscription
2. No checkout form appears
3. User sees: "✓ Successfully added 5 licenses! All 10 licenses will renew on [date]"
4. Paddle charges the customer's payment method immediately
5. Dashboard updates with new license count

### First Purchase Flow (Unchanged)

1. New user clicks "Buy Yearly License"
2. Paddle checkout overlay appears
3. User completes payment
4. License created with subscription_id
5. Dashboard shows license details

---

## Support Contacts

**If webhook fails:**

- Check Supabase Function logs
- Verify `PADDLE_WEBHOOK_SECRET` is set correctly
- Check Paddle's Event Log for delivery attempts

**If licenses don't update:**

- Check that `subscription.updated` event is being received
- Verify subscription_id is saved in database
- Manually run webhook handler with test data

**If users see checkout form:**

- Verify `subscription_id` exists on license record
- Check that subscription hasn't expired
- Clear browser cache and retry

---

## Environment Variables Required

All should already be set, but verify:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PADDLE_API_KEY=your-paddle-api-key
PADDLE_WEBHOOK_SECRET=your-paddle-webhook-secret
PADDLE_ENVIRONMENT=sandbox  # for testing
PADDLE_PRODUCT_ID=your-product-id
```

---

## Timeline

**Estimated time to full deployment:** 10 minutes

- Database: 1 min
- Functions: 2 min
- Configuration: 1 min
- Testing: 5 min

**No user-facing changes until tested** ✅

---

## After Deployment

1. Monitor webhook logs for 24 hours
2. Have at least 2 test purchases with subscriptions
3. Verify customer billing statements show correct items
4. Update dashboard UI to show which licenses are from which purchase (future enhancement)

---

## Questions?

Refer to:

- `MULTI_ITEM_SUBSCRIPTION_IMPLEMENTATION.md` - Technical details
- `supabase/functions/add-subscription-items/index.ts` - Function code
- Paddle docs: https://developer.paddle.com/build/subscriptions/add-remove-products-prices-addons
