/**
 * Paddle v2 Production Configuration
 * 
 * SETUP:
 * Replace the client token and product IDs with your PRODUCTION Paddle credentials
 * Production tokens start with 'live_'
 */

const PaddleConfigProduction = {
    environment: 'production',
    
    // Your Paddle Production Client-Side Token (starts with 'live_')
    clientToken: 'live_3c1ef4f2e7ae2807a1e291dfec9',
    
    // Price IDs for different license types (Replace with your production IDs)
    products: {
        trial: {
            id: 'pri_YOUR_PRODUCTION_TRIAL_PRICE_ID',
            name: 'MepSketcher Trial License',
            price: 0,
            duration: '14 days',
            description: 'Full access for 14 days'
        },
        yearly: {
            id: 'pri_01kgzjk1x5y4xreksqxz8v398f',
            name: 'MepSketcher Yearly License',
            price: 200,
            duration: '1 year',
            description: 'Full access for 1 year'
        }
    },
    
    // Webhook endpoint
    webhookUrl: '/paddle/webhook',
    
    // Success/failure redirect URLs
    redirectUrls: {
        success: '/purchase-success.html',
        cancel: '/purchase-cancelled.html'
    },
    
    // Custom quote contact info
    customQuote: {
        email: 'sales@mepsketcher.com',
        minLicenses: 50
    }
};
