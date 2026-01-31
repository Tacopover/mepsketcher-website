# Dynamic Pricing Implementation

## Overview

The MepSketcher website now fetches pricing information directly from Paddle in real-time. This ensures that the price displayed on the homepage always matches the current price configured in your Paddle dashboard.

## How It Works

### 1. **Price Fetching**

- When the homepage loads, the `pricing.js` script automatically fetches the current price from Paddle
- Uses Paddle's `PricePreview` API to get real-time pricing information
- Works with your configured price ID in `paddle-config.js`

### 2. **Price Display**

- Shows a "Loading..." state while fetching the price from Paddle
- Updates the price element with the fetched value
- Falls back to the configured price in `paddle-config.js` if the API call fails

### 3. **Caching**

- Prices are cached in memory to avoid unnecessary API calls
- Cache is valid for the duration of the page session
- Can be manually refreshed using `pricingManager.refreshPrices()`

## Files Modified

### Created Files

- **`js/pricing.js`** - New pricing manager that handles dynamic price fetching

### Modified Files

- **`index.html`** - Added pricing.js script include
- **`css/style.css`** - Added loading animation for price display

## Configuration

The pricing system uses your existing Paddle configuration in `paddle-config.js`:

```javascript
products: {
    yearly: {
        id: 'pri_01k6z9d511d44y0qg95nbn65qw', // Your Paddle price ID
        name: 'MepSketcher Yearly License',
        price: 299, // Fallback price if API fails
        duration: '1 year'
    }
}
```

## Testing

### 1. **Verify Price Fetching**

Open your browser console on the homepage and look for:

```
Initializing dynamic pricing...
Paddle is ready for pricing fetch
Fetching price from Paddle for price ID: pri_01k6z9d511d44y0qg95nbn65qw
✓ Price updated successfully from Paddle: {amount: XXX, currency: "USD", ...}
```

### 2. **Check Current Price**

You can manually check the price at any time:

```javascript
// In browser console
const priceInfo = await pricingManager.getPriceInfo(
  PaddleConfig.products.yearly.id
);
console.log("Current price:", priceInfo);
```

### 3. **Test Price Changes**

To verify the system picks up price changes:

1. Note the current price displayed on your homepage
2. Change the price in your Paddle dashboard
3. Wait a few minutes for Paddle to update (usually 1-2 minutes)
4. Refresh your homepage
5. The new price should be displayed automatically

### 4. **Test Fallback**

To test the fallback behavior:

```javascript
// In browser console - temporarily break Paddle
const originalPaddle = window.Paddle;
window.Paddle = undefined;
await pricingManager.refreshPrices();
// Should show fallback price from config ($299)

// Restore Paddle
window.Paddle = originalPaddle;
```

## API Details

### Paddle PricePreview API

The system uses Paddle's `PricePreview` API which:

- Does NOT require authentication (client-side token is sufficient)
- Returns current pricing including any discounts
- Provides formatted price strings with currency symbols
- Includes billing cycle information

### Response Format

```javascript
{
    amount: 29900,           // Amount in smallest currency unit (cents)
    currency: "USD",         // Currency code
    formattedAmount: "$299", // Pre-formatted price string
    billingCycle: {
        interval: 1,
        frequency: "year"
    },
    trialDays: null
}
```

## Benefits

1. **Always Current**: Price automatically reflects changes in Paddle
2. **No Manual Updates**: No need to update website when changing prices
3. **Consistency**: Ensures homepage price matches checkout price
4. **Multiple Currencies**: Automatically handles currency formatting
5. **Reliable Fallback**: Shows configured price if API is unavailable

## Troubleshooting

### Price Not Updating

**Check Console for Errors:**

```javascript
// In browser console
checkPaddleStatus(); // Shows Paddle initialization status
```

**Common Issues:**

1. **Invalid Price ID** - Verify `PaddleConfig.products.yearly.id` starts with `pri_`
2. **Paddle Not Initialized** - Check that Paddle script loads before pricing.js
3. **Sandbox vs Production** - Ensure environment matches your price ID

### Displaying Wrong Currency

The system uses Paddle's formatted price which includes the currency symbol. If you need to force a specific currency or format:

```javascript
// Modify in pricing.js, formatPrice() method
formatPrice(amount, currency = 'USD') {
    const mainAmount = amount / 100;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency, // Change this to your preferred currency
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(mainAmount);
}
```

### Manual Price Refresh

If you need to manually refresh the price (e.g., after a known price change):

```javascript
// In browser console or via a button
await pricingManager.refreshPrices();
```

## Future Enhancements

Potential improvements you might want to add:

1. **Multiple Prices** - Fetch and display prices for trial, monthly, yearly, etc.
2. **Currency Selection** - Allow users to see prices in their local currency
3. **Volume Discounts** - Display different prices for enterprise/volume purchases
4. **Promotional Pricing** - Show discounted prices during promotions
5. **Price History** - Track and display price changes over time

## Support

If you encounter issues with the pricing system:

1. Check browser console for error messages
2. Verify your Paddle configuration in `paddle-config.js`
3. Test with `checkPaddleStatus()` in browser console
4. Review Paddle dashboard for price configuration
5. Check that your price ID is correct and active

## Code Maintenance

When updating the pricing system:

- Keep fallback prices in sync with Paddle
- Test both sandbox and production environments
- Verify CSP allows Paddle API access
- Update cache duration if needed (currently session-based)
