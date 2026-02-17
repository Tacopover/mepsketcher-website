/**
 * Paddle v2 Sandbox Configuration
 * 
 * USAGE:
 * Use this for testing transactions before going live
 * Sandbox tokens start with 'test_'
 */

const PaddleConfigSandbox = {
    environment: 'sandbox',
    
    // Your Paddle Sandbox Client-Side Token (starts with 'test_')
    clientToken: 'test_1f770571fc299f02717fb5cf005',
    
    // Price IDs for different license types (Test IDs)
    products: {
        trial: {
            id: 'pri_YOUR_SANDBOX_TRIAL_PRICE_ID',
            name: 'MepSketcher Trial License (Sandbox)',
            price: 0,
            duration: '30 days',
            description: 'Full access for 30 days'
        },
        yearly: {
            id: 'pri_01k6z9d511d44y0qg95nbn65qw',
            name: 'MepSketcher Yearly License (Sandbox)',
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
