/**
 * Paddle v2 Configuration for MepSketcher
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a client-side token in Paddle > Developer tools > Authentication
 * 2. Replace 'test_YOUR_CLIENT_SIDE_TOKEN' with your actual token (test_ for sandbox, live_ for production)
 * 3. Create products and prices in your Paddle dashboard
 * 4. Replace 'pri_YOUR_YEARLY_PRICE_ID' with your actual price ID from Paddle
 * 5. Update the sales email address
 * 6. Set environment to 'production' when going live
 * 
 * NOTE: Paddle v2 uses Price IDs (pri_) instead of Product IDs
 */

const PaddleConfig = {
    // Environment: 'sandbox' for testing, 'production' for live
    environment: 'sandbox',
    
    // Your Paddle Client-Side Token
    clientToken: 'test_1f770571fc299f02717fb5cf005', 
    
    // Price IDs for different license types (REPLACE THESE)
    // In Paddle v2, you use Price IDs (pri_) instead of Product IDs
    products: {
        trial: {
            id: 'pri_YOUR_TRIAL_PRICE_ID', // TODO: Replace with your trial price ID (if applicable)
            name: 'MepSketcher Trial License',
            price: 0, // Free trial
            duration: '30 days',
            description: 'Full access for 30 days'
        },
        yearly: {
            id: 'pri_01k6z9d511d44y0qg95nbn65qw', // TODO: Replace with your yearly license price ID
            name: 'MepSketcher Yearly License',
            price: 299, // Set your actual price
            duration: '1 year',
            description: 'Full access for 1 year'
        }
    },
    
    // Webhook endpoint (for backend processing)
    webhookUrl: '/paddle/webhook', // TODO: Update with your actual webhook URL
    
    // Success/failure redirect URLs
    redirectUrls: {
        success: '/purchase-success.html',
        cancel: '/purchase-cancelled.html'
    },
    
    // Custom quote contact info
    customQuote: {
        email: 'sales@mepsketcher.com', // TODO: Replace with your sales email
        minLicenses: 100
    }
};

// Initialize Paddle v2 with configuration
function initializePaddle(eventCallback = null) {
    if (typeof Paddle === 'undefined') {
        console.error('Paddle SDK not loaded. Make sure to include the Paddle v2 script.');
        return false;
    }
    
    try {
        // Set environment BEFORE initializing (required for sandbox)
        if (PaddleConfig.environment === 'sandbox') {
            Paddle.Environment.set("sandbox");
            console.log('Paddle environment set to SANDBOX');
        } else {
            console.log('Paddle environment set to PRODUCTION (default)');
        }
        
        // Initialize Paddle.js v2 with client-side token and event callback
        const initConfig = {
            token: PaddleConfig.clientToken
            // For logged-in customers, you can add:
            // pwCustomer: {
            //     id: 'ctm_customer_paddle_id' // Paddle customer ID if user is logged in
            // }
        };
        
        // Add event callback if provided
        if (eventCallback && typeof eventCallback === 'function') {
            initConfig.eventCallback = eventCallback;
        }
        
        Paddle.Initialize(initConfig);
        
        console.log(`Paddle v2 initialized successfully in ${PaddleConfig.environment.toUpperCase()} mode with token: ${PaddleConfig.clientToken.substring(0, 10)}...`);
        return true;
    } catch (error) {
        console.error('Failed to initialize Paddle:', error);
        console.error('Make sure your client token is valid and starts with test_ or live_');
        return false;
    }
}

// Test function for debugging (can be called from browser console)
function testPaddleCheckout() {
    if (typeof Paddle === 'undefined') {
        console.error('Paddle not loaded');
        return;
    }
    
    console.log('Testing Paddle checkout...');
    console.log('Config:', PaddleConfig);
    console.log('Price ID:', PaddleConfig.products.yearly.id);
    
    // Validate price ID
    const priceId = PaddleConfig.products.yearly.id;
    if (!priceId || !priceId.startsWith('pri_')) {
        console.error('Invalid price ID format:', priceId);
        console.error('Price ID should start with "pri_"');
        return;
    }
    
    try {
        // Minimal checkout configuration to avoid 400 errors
        const checkoutConfig = {
            items: [{
                priceId: priceId,
                quantity: 1
            }]
        };
        
        console.log('Checkout config:', checkoutConfig);
        Paddle.Checkout.open(checkoutConfig);
        console.log('Checkout opened successfully');
    } catch (error) {
        console.error('Test checkout failed:', error);
    }
}

// Simplified test with just required fields
function testMinimalCheckout() {
    try {
        Paddle.Checkout.open({
            items: [{ priceId: PaddleConfig.products.yearly.id, quantity: 1 }]
        });
    } catch (error) {
        console.error('Minimal checkout failed:', error);
    }
}

// Debug function to check Paddle status
function checkPaddleStatus() {
    console.log('=== Paddle Status Check ===');
    console.log('Paddle loaded:', typeof Paddle !== 'undefined');
    console.log('PaddleConfig loaded:', typeof PaddleConfig !== 'undefined');
    console.log('Environment:', PaddleConfig?.environment || 'Not set');
    console.log('Client token:', PaddleConfig?.clientToken?.substring(0, 15) + '...');
    console.log('Price ID:', PaddleConfig?.products?.yearly?.id);
    console.log('Licensing system:', typeof mepSketcherLicensing !== 'undefined' ? 'Loaded' : 'Not loaded');
    
    // Test if we can access Paddle methods
    if (typeof Paddle !== 'undefined') {
        console.log('Paddle.Environment available:', typeof Paddle.Environment !== 'undefined');
        console.log('Paddle.Initialize available:', typeof Paddle.Initialize !== 'undefined');
        console.log('Paddle.Checkout available:', typeof Paddle.Checkout !== 'undefined');
    }
}

// Debug function to manually check pending actions
function debugPendingActions() {
    console.log('=== Pending Actions Debug ===');
    console.log('localStorage pendingPurchaseAction:', localStorage.getItem('pendingPurchaseAction'));
    console.log('URL params:', window.location.search);
    console.log('User authenticated:', typeof authService !== 'undefined' ? authService.isAuthenticated() : 'authService not available');
    
    if (typeof mepSketcherLicensing !== 'undefined') {
        console.log('Manually triggering checkPendingPurchaseAction...');
        mepSketcherLicensing.checkPendingPurchaseAction();
    }
}

// Make functions available globally for debugging
window.PaddleConfig = PaddleConfig;
window.testPaddleCheckout = testPaddleCheckout;
window.testMinimalCheckout = testMinimalCheckout;
window.initializePaddle = initializePaddle;
window.checkPaddleStatus = checkPaddleStatus;
window.debugPendingActions = debugPendingActions;

// Simple initialization function that matches test page
function initializePaddleSimple() {
    console.log('=== PADDLE INITIALIZATION (SIMPLIFIED) ===');
    console.log('1. Checking if Paddle SDK loaded...');
    
    if (typeof Paddle === 'undefined') {
        console.error('ERROR: Paddle SDK not loaded!');
        return false;
    }
    
    console.log('✓ Paddle SDK loaded successfully');

    // Step 2: Set environment to sandbox
    console.log('2. Setting environment to sandbox...');
    try {
        Paddle.Environment.set("sandbox");
        console.log('✓ Environment set to sandbox');
    } catch (error) {
        console.error('✗ Failed to set environment:', error);
        return false;
    }

    // Step 3: Initialize Paddle with client token
    console.log('3. Initializing Paddle with client token...');
    console.log('   Token:', PaddleConfig.clientToken.substring(0, 15) + '...');
    try {
        Paddle.Initialize({ 
            token: PaddleConfig.clientToken,
            eventCallback: function(data) {
                console.log('Paddle Event:', data);
            }
        });
        console.log('✓ Paddle initialized successfully');
        return true;
    } catch (error) {
        console.error('✗ Failed to initialize Paddle:', error);
        return false;
    }
}

// Wait for Paddle SDK to be ready, then initialize (exactly like test page)
function waitForPaddle() {
    if (typeof Paddle !== 'undefined') {
        // Paddle is ready
        initializePaddleSimple();
    } else {
        // Wait a bit longer
        console.log('Waiting for Paddle SDK to load...');
        setTimeout(waitForPaddle, 100);
    }
}

// Start when page loads (exactly like test page)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForPaddle);
} else {
    waitForPaddle();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaddleConfig;
}