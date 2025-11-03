/**
 * Dynamic Pricing Module
 * Fetches current prices from Paddle and updates the UI
 */

/**
 * Dynamic Pricing Manager for MepSketcher
 * Fetches current prices from Paddle and updates the homepage
 */

class PricingManager {
    constructor(priceId, priceElementId) {
        this.priceId = priceId;
        this.priceElementId = priceElementId;
        this.fallbackPrice = '€200';
    }

    // Wait for Paddle to be ready
    async waitForPaddle() {
        return new Promise((resolve) => {
            const checkPaddle = () => {
                if (typeof Paddle !== 'undefined' && Paddle.Status) {
                    console.log('✓ Paddle is ready for pricing fetch');
                    resolve();
                } else {
                    console.log('Waiting for Paddle to be ready...');
                    setTimeout(checkPaddle, 100);
                }
            };
            checkPaddle();
        });
    }

    // Fetch price from Paddle (exact same as test page)
    async fetchPriceFromPaddle() {
        try {
            console.log(`Fetching price from Paddle for price ID: ${this.priceId}`);
            
            const request = {
                items: [{
                    priceId: this.priceId,
                    quantity: 1
                }]
            };

            console.log('Request:', request);
            const result = await Paddle.PricePreview(request);
            console.log('Result received:', result);

            if (result && result.data && result.data.details && result.data.details.lineItems) {
                const lineItem = result.data.details.lineItems[0];
                const price = lineItem.formattedTotals.subtotal;
                
                console.log('✓ Price extracted:', price);
                return price;
            } else {
                console.error('Unexpected response structure:', result);
                return null;
            }
        } catch (error) {
            console.error('Failed to fetch price from Paddle:', error);
            return null;
        }
    }

    // Update price in DOM
    updatePriceDisplay(price) {
        const priceElement = document.getElementById(this.priceElementId);
        if (priceElement) {
            priceElement.textContent = price;
            console.log(`Updated ${this.priceElementId} to: ${price}`);
        }
    }

    // Main initialization
    async initialize() {
        console.log('=== PRICING MANAGER INITIALIZATION ===');
        
        // Show loading state
        this.updatePriceDisplay('Loading...');

        // Wait for Paddle to be ready
        await this.waitForPaddle();

        // Fetch price
        const price = await this.fetchPriceFromPaddle();

        // Update display
        if (price) {
            this.updatePriceDisplay(price);
            console.log('✓ Price updated successfully from Paddle');
        } else {
            this.updatePriceDisplay(this.fallbackPrice);
            console.warn('Using fallback price:', this.fallbackPrice);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePricing);
} else {
    initializePricing();
}

function initializePricing() {
    // Wait a bit to ensure Paddle is initialized first
    setTimeout(() => {
        if (typeof PaddleConfig !== 'undefined' && PaddleConfig.products.yearly.id) {
            const pricingManager = new PricingManager(
                PaddleConfig.products.yearly.id,
                'yearly-license-price'
            );
            pricingManager.initialize();
        } else {
            console.error('PaddleConfig not available');
        }
    }, 500);
}

// Make available globally for debugging
window.PricingManager = PricingManager;



// class PricingManager {
//     constructor() {
//         this.priceCache = {};
//         this.isLoading = false;
//     }

//     /**
//      * Initialize pricing - fetch and display current prices
//      */
//     async init() {
//         console.log('Initializing dynamic pricing...');
        
//         // Wait for Paddle to be initialized
//         await this.waitForPaddle();
        
//         // Fetch and update yearly license price
//         await this.updateYearlyLicensePrice();
//     }

//     /**
//      * Wait for Paddle to be loaded and initialized
//      */
//     async waitForPaddle() {
//         return new Promise((resolve) => {
//             const checkPaddle = () => {
//                 if (typeof Paddle !== 'undefined' && typeof PaddleConfig !== 'undefined') {
//                     console.log('Paddle is ready for pricing fetch');
//                     resolve();
//                 } else {
//                     console.log('Waiting for Paddle to initialize...');
//                     setTimeout(checkPaddle, 200);
//                 }
//             };
//             checkPaddle();
//         });
//     }

//     /**
//      * Fetch price information from Paddle
//      * Uses Paddle.PricePreview API to get current pricing
//      */
//     async fetchPrice(priceId) {
//         if (!priceId || !priceId.startsWith('pri_')) {
//             console.error('Invalid price ID:', priceId);
//             return null;
//         }

//         // Check cache first
//         if (this.priceCache[priceId]) {
//             console.log('Using cached price for', priceId);
//             return this.priceCache[priceId];
//         }

//         try {
//             console.log('Fetching price from Paddle for price ID:', priceId);
            
//             // Use Paddle's PricePreview API to get price details
//             // This doesn't require authentication and returns current pricing
//             const preview = await new Promise((resolve, reject) => {
//                 Paddle.PricePreview({
//                     items: [{
//                         priceId: priceId,
//                         quantity: 1
//                     }]
//                 }, (result) => {
//                     if (result.data) {
//                         resolve(result.data);
//                     } else if (result.error) {
//                         reject(result.error);
//                     } else {
//                         reject(new Error('Unknown error fetching price'));
//                     }
//                 });
//             });

//             console.log('Price preview result:', preview);

//             // Extract price information from the response
//             if (preview && preview.details && preview.details.lineItems && preview.details.lineItems.length > 0) {
//                 const lineItem = preview.details.lineItems[0];
//                 const priceInfo = {
//                     amount: lineItem.price.unitPrice.amount,
//                     currency: lineItem.price.unitPrice.currencyCode,
//                     formattedAmount: lineItem.formattedUnitTotals?.subtotal || lineItem.formattedTotals?.subtotal,
//                     billingCycle: lineItem.price.billingCycle,
//                     trialDays: lineItem.price.trialPeriod?.interval || null
//                 };

//                 // Cache the result
//                 this.priceCache[priceId] = priceInfo;
//                 console.log('Price info retrieved:', priceInfo);
                
//                 return priceInfo;
//             }

//             console.warn('Unexpected price preview format:', preview);
//             return null;
//         } catch (error) {
//             console.error('Error fetching price from Paddle:', error);
//             return null;
//         }
//     }

//     /**
//      * Update the yearly license price on the homepage
//      */
//     async updateYearlyLicensePrice() {
//         const priceId = PaddleConfig.products.yearly.id;
//         const priceElement = document.querySelector('.pricing-card.featured .price-amount');
        
//         if (!priceElement) {
//             console.warn('Price element not found on page');
//             return;
//         }

//         // Show loading state with animation
//         const originalText = priceElement.textContent;
//         priceElement.classList.add('loading');
//         priceElement.innerHTML = '<span>Loading...</span>';

//         try {
//             const priceInfo = await this.fetchPrice(priceId);
            
//             if (priceInfo) {
//                 // Update the price display with fetched value
//                 if (priceInfo.formattedAmount) {
//                     // Use Paddle's formatted amount (includes currency symbol)
//                     priceElement.textContent = priceInfo.formattedAmount;
//                 } else {
//                     // Fallback: format manually
//                     const formattedPrice = this.formatPrice(priceInfo.amount, priceInfo.currency);
//                     priceElement.textContent = formattedPrice;
//                 }
                
//                 console.log('✓ Price updated successfully from Paddle:', priceInfo);
                
//                 // Update billing cycle text if available
//                 if (priceInfo.billingCycle) {
//                     const periodElement = priceElement.parentElement.querySelector('.price-period');
//                     if (periodElement && priceInfo.billingCycle.interval === 1 && priceInfo.billingCycle.frequency === 'year') {
//                         periodElement.textContent = 'per year';
//                     }
//                 }
//             } else {
//                 // Fallback to configured price
//                 console.log('Using fallback price from config');
//                 priceElement.textContent = `$${PaddleConfig.products.yearly.price}`;
//             }
//         } catch (error) {
//             console.error('Error updating price:', error);
//             // Restore original or use config fallback
//             const fallbackPrice = `$${PaddleConfig.products.yearly.price}`;
//             priceElement.textContent = originalText === 'Loading...' ? fallbackPrice : originalText;
//         } finally {
//             // Remove loading state
//             priceElement.classList.remove('loading');
//         }
//     }

//     /**
//      * Format price amount with currency
//      */
//     formatPrice(amount, currency = 'USD') {
//         // Convert amount from smallest currency unit (cents) to main unit (dollars)
//         const mainAmount = amount / 100;
        
//         // Use Intl.NumberFormat for proper currency formatting
//         try {
//             return new Intl.NumberFormat('en-US', {
//                 style: 'currency',
//                 currency: currency,
//                 minimumFractionDigits: 0,
//                 maximumFractionDigits: 0
//             }).format(mainAmount);
//         } catch (error) {
//             console.error('Error formatting price:', error);
//             return `$${mainAmount.toFixed(0)}`;
//         }
//     }

//     /**
//      * Get price info for display (for use in other parts of the app)
//      */
//     async getPriceInfo(priceId) {
//         return await this.fetchPrice(priceId);
//     }

//     /**
//      * Refresh all prices on the page
//      */
//     async refreshPrices() {
//         // Clear cache
//         this.priceCache = {};
        
//         // Re-fetch prices
//         await this.updateYearlyLicensePrice();
//     }
// }

// // Initialize pricing manager
// let pricingManager;

// // Wait for DOM to be ready
// if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', initializePricing);
// } else {
//     initializePricing();
// }

// async function initializePricing() {
//     console.log('Initializing pricing manager...');
//     pricingManager = new PricingManager();
    
//     // Initialize after a short delay to ensure Paddle is loaded
//     setTimeout(async () => {
//         try {
//             await pricingManager.init();
//         } catch (error) {
//             console.error('Failed to initialize pricing:', error);
//         }
//     }, 500);
// }

// // Export for global access
// window.pricingManager = pricingManager;
