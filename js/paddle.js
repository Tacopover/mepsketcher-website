/**
 * Paddle Integration for MepSketcher Licensing
 * Handles trial registration, yearly license purchases, and custom quotes
 */

class MepSketcherLicensing {
    constructor() {
        this.isInitialized = false;
        this.init();
    }

    /**
     * Initialize Paddle and set up event listeners
     */
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializePaddle());
        } else {
            this.initializePaddle();
        }
    }

    /**
     * Initialize Paddle SDK
     */
    initializePaddle() {
        if (typeof PaddleConfig === 'undefined') {
            console.error('PaddleConfig not loaded. Make sure paddle-config.js is included.');
            return;
        }

        if (typeof Paddle === 'undefined') {
            console.error('Paddle SDK not loaded. Make sure to include the Paddle script tag.');
            return;
        }

        // Initialize Paddle with configuration
        const success = initializePaddle(this.handlePaddleEvent.bind(this)); // Pass event callback
        if (success) {
            this.isInitialized = true;
            console.log('MepSketcher Licensing initialized successfully');
        }
    }

    /**
     * Handle Paddle v2 events via eventCallback
     */
    handlePaddleEvent(event) {
        console.log('Paddle event:', event);
        
        switch(event.name) {
            case 'checkout.completed':
                console.log('Checkout completed:', event.data);
                this.handlePurchaseSuccess(event.data);
                break;
                
            case 'checkout.closed':
                console.log('Checkout closed:', event.data);
                break;
                
            case 'checkout.error':
                console.error('Checkout error:', event.data);
                this.showError('An error occurred during checkout. Please try again.');
                break;
                
            case 'checkout.loaded':
                console.log('Checkout loaded:', event.data);
                break;
                
            default:
                console.log('Unhandled Paddle event:', event.name, event.data);
        }
    }

    /**
     * Start free trial - redirects to login/signup
     */
    async startTrial() {
        // Check if user is authenticated
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase not initialized');
            this.showError('Authentication system unavailable. Please try again later.');
            return;
        }

        console.log('Checking authentication for trial...');
        
        // Get current user
        const { data: { user }, error: userError } = await window.supabase.auth.getUser();
        
        if (userError || !user) {
            console.log('User not authenticated, showing login dialog for trial');
            // Show login dialog with trial context
            this.showLoginDialog('trial');
            return;
        }

        console.log('User is authenticated:', user.email);
        
        // User is already authenticated and has trial access
        // Redirect to dashboard where they can download the app
        this.showTrialSuccess(user.email);
    }

    /**
     * Show trial success message for authenticated users
     */
    showTrialSuccess(userEmail) {
        this.showSuccess('Trial Active!', `
            <div class="trial-success-message" style="text-align: center;">
                <p style="margin-bottom: 20px; font-size: 16px;">
                    Your 14-day free trial is active for <strong>${userEmail}</strong>
                </p>
                <p style="margin-bottom: 20px; color: #666;">
                    You can now download and install MepSketcher from your dashboard.
                </p>
                <div style="margin: 30px 0;">
                    <a href="/dashboard.html" class="btn btn-primary" style="text-decoration: none; padding: 12px 32px; background: #007bff; color: white; border-radius: 4px; display: inline-block; font-weight: 600;">
                        Go to Dashboard
                    </a>
                </div>
                <div class="trial-info" style="text-align: left; background: #f8f9fa; padding: 20px; border-radius: 4px; margin-top: 20px;">
                    <h4 style="margin: 0 0 15px; color: #333;">Next Steps:</h4>
                    <ol style="margin: 0; padding-left: 20px; color: #666;">
                        <li style="margin-bottom: 8px;">Go to your dashboard</li>
                        <li style="margin-bottom: 8px;">Download the MepSketcher installer</li>
                        <li style="margin-bottom: 8px;">Install and launch the application</li>
                        <li>Sign in with your account to activate your trial</li>
                    </ol>
                </div>
            </div>
        `);
    }

    /**
     * Purchase yearly license using Paddle v2
     */
    async purchaseYearlyLicense(quantity = 1) {
        if (!this.isInitialized) {
            console.error('Paddle not initialized');
            this.showError('Payment system unavailable. Please try again later.');
            return;
        }

        // Check if user is authenticated
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase not initialized');
            this.showError('Authentication system unavailable. Please try again later.');
            return;
        }

        console.log('Checking authentication...');
        
        // Get current user
        const { data: { user }, error: userError } = await window.supabase.auth.getUser();
        
        console.log('User data:', user);
        console.log('User error:', userError);
        
        if (userError || !user) {
            console.log('User not authenticated, showing login dialog');
            // Show login dialog instead of redirecting
            this.showLoginDialog();
            return;
        }

        console.log('User is authenticated:', user.email);

        // Get user's organization
        console.log('Fetching user organization...');
        const { data: organizations, error: orgError } = await window.supabase
            .from('organizations')
            .select('id')
            .eq('owner_id', user.id)
            .single();

        if (orgError || !organizations) {
            console.error('Failed to fetch organization:', orgError);
            this.showError('Could not find your organization. Please contact support.');
            return;
        }

        console.log('Found organization:', organizations.id);

        // Check if organization has existing licenses
        console.log('Checking for existing licenses...');
        const { data: existingLicense, error: licenseError } = await window.supabase
            .from('organization_licenses')
            .select('*')
            .eq('organization_id', organizations.id)
            .maybeSingle();

        if (licenseError && licenseError.code !== 'PGRST116') {
            console.error('Error checking licenses:', licenseError);
        }

        let priceId;
        let customData = {
            userId: user.id,
            organizationId: organizations.id,
            email: user.email,
            license_type: 'yearly',
            product: 'mepsketcher',
            version: '1.0',
            timestamp: new Date().toISOString(),
            quantity: quantity
        };

        // If user has existing licenses, create prorated price
        if (existingLicense && existingLicense.expires_at) {
            const expiresAt = new Date(existingLicense.expires_at);
            const now = new Date();
            
            // Only prorate if license hasn't expired
            if (expiresAt > now) {
                const remainingDays = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
                console.log(`Existing license found with ${remainingDays} days remaining`);
                
                // Create custom prorated price
                try {
                    const { data: { session } } = await window.supabase.auth.getSession();
                    const response = await fetch(`${window.supabase.supabaseUrl}/functions/v1/create-custom-price`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            organizationId: organizations.id,
                            quantity: quantity,
                            remainingDays: remainingDays
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        console.error('Failed to create custom price:', errorData);
                        throw new Error(errorData.error || 'Failed to create prorated price');
                    }

                    const priceData = await response.json();
                    console.log('Custom prorated price created:', priceData);
                    
                    priceId = priceData.priceId;
                    customData.prorated = true;
                    customData.remainingDays = remainingDays;
                    customData.proratedAmount = priceData.amount;
                } catch (error) {
                    console.error('Error creating prorated price:', error);
                    this.showError('Failed to calculate prorated price. Please try again or contact support.');
                    return;
                }
            } else {
                // License expired, use standard price
                console.log('Existing license has expired, using standard price');
                priceId = PaddleConfig.products.yearly.id;
            }
        } else {
            // No existing license, use standard price
            console.log('No existing license found, using standard price');
            priceId = PaddleConfig.products.yearly.id;
        }

        // Validate price ID
        if (!priceId || !priceId.startsWith('pri_')) {
            console.error('Invalid price ID:', priceId);
            this.showError('Configuration error: Invalid price ID. Please check your Paddle configuration.');
            return;
        }

        // Prepare checkout items array (required format)
        const itemsList = [{
            priceId: priceId,
            quantity: quantity
        }];

        console.log('Using price ID:', priceId);

        // Build checkout options object
        const checkoutOptions = {
            settings: {
                displayMode: "overlay",
                theme: "light",
                locale: "en"
            },
            items: itemsList,
            customer: {
                email: user.email
            },
            customData: customData
        };

        // Add discount code if available
        const discountCode = this.getCouponFromURL();
        if (discountCode) {
            checkoutOptions.discountCode = discountCode;
        }

        console.log('Opening Paddle checkout with options:', JSON.stringify(checkoutOptions, null, 2));

        // Open Paddle v2 checkout using the exact syntax from documentation
        try {
            Paddle.Checkout.open(checkoutOptions);
            console.log('Paddle checkout opened successfully');
        } catch (error) {
            console.error('Failed to open checkout:', error);
            this.showError('Payment system unavailable. Please try again later.');
        }
    }

    /**
     * TEMPORARY TEST FUNCTION: Insert rows directly to test RLS policies
     */
    async testDirectDatabaseInsert(userId, organizationId, userEmail) {
        console.log('Testing direct database insert...');
        console.log('User ID:', userId);
        console.log('Organization ID:', organizationId);

        try {
            // Step 1: Check if user is already in organization_members
            console.log('Step 1: Checking existing membership...');
            const { data: existingMember, error: checkError } = await window.supabase
                .from('organization_members')
                .select("organization_id")
                .eq("user_id", userId)
                .maybeSingle();

            if (checkError) {
                console.error('Error checking membership:', checkError);
                this.showError(`Error checking membership: ${checkError.message}`);
                return;
            }

            if (existingMember) {
                console.log('User already in organization_members with role:', existingMember.role);
            } else {
                // Step 2: Try to add user to organization_members
                console.log('Step 2: Adding user to organization_members...');
                const { data: newMember, error: memberError } = await window.supabase
                    .from('organization_members')
                    .insert({
                        user_id: userId,
                        organization_id: organizationId,
                        role: 'admin'
                    })
                    .select()
                    .single();

                if (memberError) {
                    console.error('ERROR adding to organization_members:', memberError);
                    this.showError(`Failed to add to organization_members: ${memberError.message}`);
                    return;
                } else {
                    console.log('SUCCESS! Added to organization_members:', newMember);
                }
            }

            // Step 3: Check if license already exists
            console.log('Step 3: Checking existing license...');
            const { data: existingLicense, error: licenseCheckError } = await window.supabase
                .from('organization_licenses')
                .select('*')
                .eq('organization_id', organizationId)
                .maybeSingle();

            if (licenseCheckError) {
                console.error('Error checking license:', licenseCheckError);
                this.showError(`Error checking license: ${licenseCheckError.message}`);
                return;
            }

            if (existingLicense) {
                console.log('License already exists:', existingLicense);
                this.showSuccess('Test Complete', 'User is already in organization_members and license already exists!');
            } else {
                // Step 4: Try to add license
                console.log('Step 4: Adding license to organization_licenses...');
                const { data: newLicense, error: licenseError } = await window.supabase
                    .from('organization_licenses')
                    .insert({
                        organization_id: organizationId,
                        total_licenses: 1,
                        used_licenses: 1,
                        license_type: 'standard',
                        paddle_id: 'test_' + Date.now(),
                        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
                    })
                    .select()
                    .single();

                if (licenseError) {
                    console.error('ERROR adding to organization_licenses:', licenseError);
                    this.showError(`Failed to add to organization_licenses: ${licenseError.message}`);
                    return;
                } else {
                    console.log('SUCCESS! Added to organization_licenses:', newLicense);
                    this.showSuccess('Test Complete', 'Successfully added user to organization_members and created license!');
                }
            }

        } catch (error) {
            console.error('Unexpected error:', error);
            this.showError(`Unexpected error: ${error.message}`);
        }
    }

    /**
     * Handle successful purchase (Paddle v2)
     */
    handlePurchaseSuccess(data) {
        console.log('Purchase successful:', data);
        
        // Extract transaction ID from v2 data structure
        const transactionId = data.transactionId || data.id || 'N/A';
        
        // Redirect to success page or show success message
        if (PaddleConfig.redirectUrls.success) {
            window.location.href = `${PaddleConfig.redirectUrls.success}?transaction=${transactionId}`;
        } else {
            this.showSuccess('Purchase Successful!', `
                <p>Thank you for purchasing MepSketcher!</p>
                <p><strong>Transaction ID:</strong> ${transactionId}</p>
                <p>You will receive an email with your license key and download instructions shortly.</p>
                <div class="success-actions">
                    <a href="#download" class="btn btn-primary" onclick="mepSketcherLicensing.closeModal()">Go to Download</a>
                </div>
            `);
        }
    }

    /**
     * Request custom quote for enterprise customers
     */
    requestCustomQuote() {
        this.showCustomQuoteModal();
    }

    /**
     * Show custom quote request modal
     */
    showCustomQuoteModal() {
        const modal = this.createModal('Enterprise Quote Request', `
            <div class="quote-form">
                <p>Get a custom quote for ${PaddleConfig.customQuote.minLicenses}+ licenses with volume discounts.</p>
                <form id="quote-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="quote-name">Name *:</label>
                            <input type="text" id="quote-name" name="quote-name" required>
                        </div>
                        <div class="form-group">
                            <label for="quote-email">Email *:</label>
                            <input type="email" id="quote-email" name="quote-email" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="quote-company">Company *:</label>
                            <input type="text" id="quote-company" name="quote-company" required>
                        </div>
                        <div class="form-group">
                            <label for="quote-phone">Phone:</label>
                            <input type="tel" id="quote-phone" name="quote-phone">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="quote-licenses">Number of Licenses *:</label>
                        <input type="number" id="quote-licenses" name="quote-licenses" min="${PaddleConfig.customQuote.minLicenses}" required placeholder="${PaddleConfig.customQuote.minLicenses}+">
                    </div>
                    <div class="form-group">
                        <label for="quote-requirements">Special Requirements:</label>
                        <textarea id="quote-requirements" name="quote-requirements" rows="4" placeholder="Tell us about your specific needs, timeline, training requirements, etc."></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="mepSketcherLicensing.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Request Quote</button>
                    </div>
                </form>
            </div>
        `);

        // Handle form submission
        const form = modal.querySelector('#quote-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.processQuoteRequest(form);
        });
    }

    /**
     * Process custom quote request
     */
    async processQuoteRequest(form) {
        const formData = new FormData(form);
        
        // Parse and validate licenses number
        const licensesValue = formData.get('quote-licenses');
        const parsedLicenses = parseInt(licensesValue);
        
        // Validate that we got a valid number
        if (!licensesValue || isNaN(parsedLicenses) || parsedLicenses < 1) {
            alert('Please enter a valid number of licenses');
            return;
        }
        
        const quoteData = {
            name: formData.get('quote-name'),
            email: formData.get('quote-email'),
            company: formData.get('quote-company'),
            phone: formData.get('quote-phone') || '',
            licenses: parsedLicenses,
            requirements: formData.get('quote-requirements') || '',
            timestamp: new Date().toISOString()
        };
        
        // Debug: Log the data being sent
        console.log('Sending quote request:', quoteData);

        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        try {
            // Send quote request to Supabase edge function
            const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-quote-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                    'apikey': SUPABASE_CONFIG.anonKey
                },
                body: JSON.stringify(quoteData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to send quote request');
            }

            // Success!
            this.closeModal();
            this.showSuccess('Quote Request Sent!', `
                <p>Thank you for your interest in MepSketcher!</p>
                <p>Our sales team will contact you as soon as possible.</p>
            `);

        } catch (error) {
            console.error('Error sending quote request:', error);
            
            // Show error message
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            
            // Show error in modal
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.style.cssText = 'background-color: #fee; border: 1px solid #fcc; color: #c33; padding: 12px; border-radius: 4px; margin-top: 15px;';
            errorDiv.textContent = `Failed to send quote request. Please try again or contact us directly at ${PaddleConfig.customQuote.email}`;
            
            const existingError = form.querySelector('.error-message');
            if (existingError) {
                existingError.remove();
            }
            form.appendChild(errorDiv);
        }
    }

    /**
     * Utility method to get coupon code from URL
     */
    getCouponFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('coupon') || urlParams.get('discount');
    }

    /**
     * Create a modal dialog
     */
    createModal(title, content) {
        // Remove existing modal if any
        this.closeModal();

        const modal = document.createElement('div');
        modal.className = 'paddle-modal-overlay';
        modal.innerHTML = `
            <div class="paddle-modal">
                <div class="paddle-modal-header">
                    <h3>${title}</h3>
                    <button class="paddle-modal-close" onclick="mepSketcherLicensing.closeModal()">&times;</button>
                </div>
                <div class="paddle-modal-body">
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden'; // Prevent background scroll

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });

        return modal;
    }

    /**
     * Close modal dialog
     */
    closeModal() {
        const modal = document.querySelector('.paddle-modal-overlay');
        if (modal) {
            modal.remove();
            document.body.style.overflow = '';
        }
    }

    /**
     * Show success message
     */
    showSuccess(title, content) {
        this.createModal(title, `
            <div class="success-message">
                <div class="success-icon">✅</div>
                ${content}
                <div class="form-actions">
                    <button class="btn btn-primary" onclick="mepSketcherLicensing.closeModal()">Close</button>
                </div>
            </div>
        `);
    }

    /**
     * Show error message
     */
    showError(message) {
        this.createModal('Error', `
            <div class="error-message">
                <div class="error-icon">❌</div>
                <p>${message}</p>
                <div class="form-actions">
                    <button class="btn btn-secondary" onclick="mepSketcherLicensing.closeModal()">Close</button>
                </div>
            </div>
        `);
    }

    /**
     * Show login dialog when user tries to purchase or start trial without being authenticated
     * @param {string} context - 'trial' or 'purchase' to customize the message
     */
    showLoginDialog(context = 'purchase') {
        const isTrial = context === 'trial';
        const title = isTrial ? 'Start Your Free Trial' : 'Authentication Required';
        const message = isTrial 
            ? 'Please sign in or create an account to start your 14-day free trial.'
            : 'Please sign in or create an account to purchase a license.';
        const redirectUrl = isTrial ? '/login.html?action=trial' : '/login.html';
        
        this.createModal(title, `
            <div class="login-required-message" style="text-align: center; padding: 20px;">
                <p style="margin-bottom: 20px; font-size: 16px;">
                    ${message}
                </p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <a href="${redirectUrl}" class="btn btn-primary" style="text-decoration: none; padding: 12px 24px; background: #007bff; color: white; border-radius: 4px; display: inline-block;">
                        Sign In
                    </a>
                    <a href="${redirectUrl}#signup" class="btn btn-secondary" style="text-decoration: none; padding: 12px 24px; background: #6c757d; color: white; border-radius: 4px; display: inline-block;">
                        Sign Up
                    </a>
                </div>
            </div>
        `);
    }
}

// Initialize the licensing system
let mepSketcherLicensing;

// Wait for dependencies to load
function initializeLicensing() {
    if (typeof PaddleConfig !== 'undefined' && typeof Paddle !== 'undefined') {
        mepSketcherLicensing = new MepSketcherLicensing();
    } else {
        console.log('Waiting for Paddle and PaddleConfig to load...');
        setTimeout(initializeLicensing, 200); // Retry after 200ms
    }
}

// Global functions for button clicks
function startTrial() {
    if (mepSketcherLicensing) {
        mepSketcherLicensing.startTrial();
    } else {
        console.error('Licensing system not initialized');
    }
}

function purchaseYearlyLicense(quantity = 1) {
    if (mepSketcherLicensing) {
        mepSketcherLicensing.purchaseYearlyLicense(quantity);
    } else {
        console.error('Licensing system not initialized');
    }
}

function requestCustomQuote() {
    if (mepSketcherLicensing) {
        mepSketcherLicensing.requestCustomQuote();
    } else {
        console.error('Licensing system not initialized');
    }
}

// Start initialization
initializeLicensing();