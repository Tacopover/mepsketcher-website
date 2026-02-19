/**
 * Paddle v2 Configuration for MepSketcher
 * 
 * ARCHITECTURE:
 * - paddle-environment.js : Controls which environment (sandbox or production)
 * - paddle-config.sandbox.js : Sandbox/test configuration  
 * - paddle-config.production.js : Production configuration
 * - paddle-config.js (this file) : Wrapper that loads the appropriate config
 * 
 * TO SWITCH ENVIRONMENTS:
 * Edit js/paddle-environment.js and change PADDLE_ENVIRONMENT to 'sandbox' or 'production'
 */

// Load the appropriate config based on environment selection
let PaddleConfig;

if (typeof PADDLE_ENVIRONMENT === 'undefined') {
    console.error('ERROR: paddle-environment.js not loaded. Make sure it\'s included before paddle-config.js');
    // Default to production if environment not defined
    PaddleConfig = typeof PaddleConfigProduction !== 'undefined' ? PaddleConfigProduction : {};
} else if (PADDLE_ENVIRONMENT === 'sandbox') {
    if (typeof PaddleConfigSandbox === 'undefined') {
        console.error('ERROR: paddle-config.sandbox.js not loaded');
        PaddleConfig = {};
    } else {
        PaddleConfig = PaddleConfigSandbox;
        console.log('ℹ️ Paddle configured for SANDBOX environment');
    }
} else if (PADDLE_ENVIRONMENT === 'production') {
    if (typeof PaddleConfigProduction === 'undefined') {
        console.error('ERROR: paddle-config.production.js not loaded');
        PaddleConfig = {};
    } else {
        PaddleConfig = PaddleConfigProduction;
        console.log('✓ Paddle configured for PRODUCTION environment');
    }
} else {
    console.error(`ERROR: Unknown environment "${PADDLE_ENVIRONMENT}". Use 'sandbox' or 'production'`);
    PaddleConfig = {};
}

// Initialize Paddle v2 with configuration
function initializePaddle(eventCallback = null) {
    if (typeof Paddle === 'undefined') {
        console.error('Paddle SDK not loaded. Make sure to include the Paddle v2 script.');
        return false;
    }
    
    try {
        // Set environment BEFORE initializing (required for proper routing)
        if (PaddleConfig.environment === 'sandbox') {
            Paddle.Environment.set("sandbox");
            console.log('Paddle environment set to SANDBOX');
        } else if (PaddleConfig.environment === 'production') {
            Paddle.Environment.set("production");
            console.log('Paddle environment set to PRODUCTION');
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

// Make functions available globally for debugging (only in development)
if (window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.includes('github.io')) {
    window.PaddleConfig = PaddleConfig;
    window.testPaddleCheckout = testPaddleCheckout;
    window.testMinimalCheckout = testMinimalCheckout;
    window.initializePaddle = initializePaddle;
    window.checkPaddleStatus = checkPaddleStatus;
    window.debugPendingActions = debugPendingActions;
    console.log('🔧 Paddle debug functions enabled (development mode)');
}

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