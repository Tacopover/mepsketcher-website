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
     * Start free trial - handles trial license registration
     */
    startTrial() {
        if (!this.isInitialized) {
            console.error('Paddle not initialized');
            this.showError('Unable to start trial. Please try again later.');
            return;
        }

        // For trials, we might want to collect email first
        this.showTrialModal();
    }

    /**
     * Show trial registration modal
     */
    showTrialModal() {
        // Create a simple modal to collect email for trial
        const modal = this.createModal('Start Your Free Trial', `
            <div class="trial-form">
                <p>Get instant access to MepSketcher for 30 days.</p>
                <form id="trial-form">
                    <div class="form-group">
                        <label for="trial-email">Email Address:</label>
                        <input type="email" id="trial-email" required placeholder="your@email.com">
                    </div>
                    <div class="form-group">
                        <label for="trial-name">Name:</label>
                        <input type="text" id="trial-name" required placeholder="Your Name">
                    </div>
                    <div class="form-group">
                        <label for="trial-company">Company (Optional):</label>
                        <input type="text" id="trial-company" placeholder="Your Company">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="mepSketcherLicensing.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Start Free Trial</button>
                    </div>
                </form>
            </div>
        `);

        // Handle form submission
        const form = modal.querySelector('#trial-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.processTrial(form);
        });
    }

    /**
     * Process trial registration
     */
    processTrial(form) {
        const formData = new FormData(form);
        const trialData = {
            email: formData.get('trial-email'),
            name: formData.get('trial-name'),
            company: formData.get('trial-company') || '',
            product: 'trial',
            timestamp: new Date().toISOString()
        };

        // In a real implementation, you'd send this to your backend
        // For now, we'll simulate the process
        this.simulateTrialProcess(trialData);
    }

    /**
     * Simulate trial process (replace with actual backend call)
     */
    simulateTrialProcess(trialData) {
        // Show loading state
        const form = document.getElementById('trial-form');
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Processing...';
        submitBtn.disabled = true;

        // Simulate API call
        setTimeout(() => {
            this.closeModal();
            this.showSuccess('Trial Started!', `
                <p>Your 30-day free trial has been activated!</p>
                <p>Download instructions have been sent to <strong>${trialData.email}</strong>.</p>
                <div class="trial-info">
                    <h4>Next Steps:</h4>
                    <ol>
                        <li>Check your email for the download link</li>
                        <li>Install MepSketcher</li>
                        <li>Use your email to activate the trial</li>
                    </ol>
                </div>
            `);
        }, 2000);
    }

    /**
     * Purchase yearly license using Paddle v2
     */
    purchaseYearlyLicense() {
        if (!this.isInitialized) {
            console.error('Paddle not initialized');
            this.showError('Payment system unavailable. Please try again later.');
            return;
        }

        // Validate price ID first
        const priceId = PaddleConfig.products.yearly.id;
        if (!priceId || !priceId.startsWith('pri_')) {
            console.error('Invalid price ID:', priceId);
            this.showError('Configuration error: Invalid price ID. Please check your Paddle configuration.');
            return;
        }

        // Prepare checkout items array (required format)
        const itemsList = [{
            priceId: priceId,
            quantity: 1
        }];

        console.log('Using price ID:', priceId);

        // Prepare custom data
        const customData = {
            license_type: 'yearly',
            product: 'mepsketcher',
            version: '1.0',
            timestamp: new Date().toISOString()
        };

        // Build checkout options object - simplified for debugging
        const checkoutOptions = {
            settings: {
                displayMode: "overlay",
                theme: "light",
                locale: "en"
            },
            items: itemsList
        };

        // Only add customData if it's a valid object
        if (customData && Object.keys(customData).length > 0) {
            checkoutOptions.customData = customData;
        }

        // Add discount code if available
        const discountCode = this.getCouponFromURL();
        if (discountCode) {
            checkoutOptions.discountCode = discountCode;
        }

        console.log('Checkout options:', JSON.stringify(checkoutOptions, null, 2));

        // Open Paddle v2 checkout using the exact syntax from documentation
        try {
            Paddle.Checkout.open(checkoutOptions);
            console.log('Checkout opened successfully with items:', itemsList);
        } catch (error) {
            console.error('Failed to open checkout:', error);
            this.showError('Payment system unavailable. Please try again later.');
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
                            <input type="text" id="quote-name" required>
                        </div>
                        <div class="form-group">
                            <label for="quote-email">Email *:</label>
                            <input type="email" id="quote-email" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="quote-company">Company *:</label>
                            <input type="text" id="quote-company" required>
                        </div>
                        <div class="form-group">
                            <label for="quote-phone">Phone:</label>
                            <input type="tel" id="quote-phone">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="quote-licenses">Number of Licenses *:</label>
                        <input type="number" id="quote-licenses" min="${PaddleConfig.customQuote.minLicenses}" required placeholder="${PaddleConfig.customQuote.minLicenses}+">
                    </div>
                    <div class="form-group">
                        <label for="quote-requirements">Special Requirements:</label>
                        <textarea id="quote-requirements" rows="4" placeholder="Tell us about your specific needs, timeline, training requirements, etc."></textarea>
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
    processQuoteRequest(form) {
        const formData = new FormData(form);
        const quoteData = {
            name: formData.get('quote-name'),
            email: formData.get('quote-email'),
            company: formData.get('quote-company'),
            phone: formData.get('quote-phone') || '',
            licenses: formData.get('quote-licenses'),
            requirements: formData.get('quote-requirements') || '',
            timestamp: new Date().toISOString()
        };

        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        // In a real implementation, send to your backend
        // For now, simulate with mailto (fallback)
        this.simulateQuoteProcess(quoteData);
    }

    /**
     * Simulate quote request process
     */
    simulateQuoteProcess(quoteData) {
        setTimeout(() => {
            this.closeModal();
            
            // Create mailto link as fallback
            const subject = `MepSketcher Enterprise Quote Request - ${quoteData.company}`;
            const body = `Name: ${quoteData.name}
Email: ${quoteData.email}
Company: ${quoteData.company}
Phone: ${quoteData.phone}
Licenses Needed: ${quoteData.licenses}
Requirements: ${quoteData.requirements}

Generated: ${quoteData.timestamp}`;
            
            const mailtoLink = `mailto:${PaddleConfig.customQuote.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            
            this.showSuccess('Quote Request Sent!', `
                <p>Thank you for your interest in MepSketcher Enterprise!</p>
                <p>Our sales team will contact you within 24 hours at <strong>${quoteData.email}</strong>.</p>
                <p>For immediate assistance, you can also email us directly:</p>
                <p><a href="${mailtoLink}" class="btn btn-secondary">Send Email</a></p>
            `);
        }, 1500);
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

function purchaseYearlyLicense() {
    if (mepSketcherLicensing) {
        mepSketcherLicensing.purchaseYearlyLicense();
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