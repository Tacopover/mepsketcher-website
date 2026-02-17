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
    clientToken: 'live_YOUR_PRODUCTION_CLIENT_TOKEN_HERE',
    
    // Price IDs for different license types (Replace with your production IDs)
    products: {
        trial: {
            id: 'pri_YOUR_PRODUCTION_TRIAL_PRICE_ID',
            name: 'MepSketcher Trial License',
            price: 0,
            duration: '30 days',
            description: 'Full access for 30 days'
        },
        yearly: {
            id: 'pri_YOUR_PRODUCTION_YEARLY_PRICE_ID',
            name: 'MepSketcher Yearly License',
            price: 299,
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
        minLicenses: 100
    }
};
