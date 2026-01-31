# Dynamic Pricing - Quick Testing Guide

## ✅ Quick Verification Steps

### Step 1: Open Your Homepage

Navigate to your MepSketcher homepage in a browser.

### Step 2: Open Browser Console

Press `F12` or right-click → "Inspect" → "Console" tab

### Step 3: Check Console Output

You should see messages like:

```
Initializing pricing manager...
Initializing dynamic pricing...
Paddle is ready for pricing fetch
Fetching price from Paddle for price ID: pri_01k6z9d511d44y0qg95nbn65qw
Price preview result: {...}
Price info retrieved: {...}
✓ Price updated successfully from Paddle: {amount: 29900, currency: "USD", ...}
```

### Step 4: Verify Price Display

- Look at the "Yearly License" pricing card
- The price should briefly show "Loading..." then update to your Paddle price
- The price should match what's in your Paddle dashboard

### Step 5: Test Manual Refresh (Optional)

In the browser console, run:

```javascript
await pricingManager.refreshPrices();
```

The price should reload from Paddle.

## 🔧 Debugging Commands

If the price isn't updating, run these in the browser console:

### Check Paddle Status

```javascript
checkPaddleStatus();
```

Should show:

- Paddle loaded: true
- Environment: sandbox or production
- Price ID: pri_01k6z9d511d44y0qg95nbn65qw

### Get Current Price Info

```javascript
const priceInfo = await pricingManager.getPriceInfo(
  PaddleConfig.products.yearly.id
);
console.log("Price info:", priceInfo);
```

### Check Pricing Manager

```javascript
console.log("Pricing Manager:", pricingManager);
console.log("Price Cache:", pricingManager.priceCache);
```

## ⚠️ Common Issues

### Issue: Price shows "$299" (fallback) instead of Paddle price

**Possible Causes:**

1. Invalid price ID - Check `PaddleConfig.products.yearly.id`
2. Paddle not initialized - Check console for Paddle errors
3. Network error - Check browser Network tab for failed requests

**Solution:**

- Verify price ID in `js/paddle-config.js`
- Ensure price ID starts with `pri_`
- Check that price is active in Paddle dashboard

### Issue: Console shows "Invalid price ID"

**Cause:** Price ID format is incorrect

**Solution:**
Edit `js/paddle-config.js` and ensure:

```javascript
products: {
    yearly: {
        id: 'pri_YOUR_PRICE_ID', // Must start with 'pri_'
        price: 299 // Fallback price
    }
}
```

### Issue: Price never loads (stuck on "Loading...")

**Possible Causes:**

1. Paddle script not loading
2. CSP blocking Paddle API calls
3. JavaScript error preventing execution

**Solution:**

1. Check browser console for errors
2. Verify CSP in `index.html` includes `https://*.paddle.com`
3. Check Network tab for blocked requests

## 📊 Expected Behavior

### On Page Load:

1. Price shows "$299" (from HTML)
2. Briefly shows "Loading..." with pulse animation
3. Updates to current Paddle price (e.g., "$299" or "$349")
4. Console shows "✓ Price updated successfully from Paddle"

### After Price Change in Paddle:

1. Change price in Paddle dashboard
2. Wait 1-2 minutes for Paddle to update
3. Refresh your webpage
4. New price should display automatically

### On Error:

1. Console shows error message
2. Price falls back to configured amount ($299)
3. No visible error to user (graceful degradation)

## 🎯 Success Criteria

✅ Price loads from Paddle on page load
✅ Console shows successful price fetch
✅ Price matches Paddle dashboard
✅ Loading animation displays smoothly
✅ Fallback price works if API fails
✅ No console errors

## 📞 Need Help?

If you continue to have issues:

1. Check the full documentation: `docs/DYNAMIC_PRICING_IMPLEMENTATION.md`
2. Verify your Paddle configuration in the dashboard
3. Test with a different browser
4. Check for browser extensions blocking scripts
