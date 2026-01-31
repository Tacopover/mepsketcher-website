/**
 * License Expiration & Renewal Manager
 * Handles license expiration alerts and renewal flows in the dashboard
 */

class LicenseExpirationManager {
    constructor(supabase, organizationId) {
        this.supabase = supabase;
        this.organizationId = organizationId;
        this.currentLicense = null;
    }

    /**
     * Initialize and check for expiring licenses
     */
    async initialize() {
        await this.loadLicenseInfo();
        await this.checkAndShowExpirationBanner();
        this.setupRenewalListeners();
    }

    /**
     * Load current license information
     */
    async loadLicenseInfo() {
        try {
            const { data, error } = await this.supabase
                .from('organization_licenses')
                .select('*')
                .eq('organization_id', this.organizationId)
                .order('expires_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('Error loading license:', error);
                return null;
            }

            this.currentLicense = data;
            return data;
        } catch (error) {
            console.error('Exception loading license:', error);
            return null;
        }
    }

    /**
     * Get license status using client-side logic
     */
    async getLicenseStatus() {
        try {
            if (!this.currentLicense) {
                return {
                    status: 'no_license',
                    message: 'No license found'
                };
            }

            const expiresAt = new Date(this.currentLicense.expires_at);
            const now = new Date();
            const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
            const isInGracePeriod = this.isInGracePeriod(expiresAt);

            // Determine status based on days remaining
            if (daysRemaining < -30) {
                return {
                    status: 'expired',
                    days_remaining: daysRemaining,
                    in_grace_period: false,
                    expires_at: this.currentLicense.expires_at,
                    message: 'License expired more than 30 days ago',
                    severity: 'critical',
                    action_required: true
                };
            } else if (isInGracePeriod) {
                const graceDaysLeft = 30 + daysRemaining;
                return {
                    status: 'grace_period',
                    days_remaining: daysRemaining,
                    grace_days_left: graceDaysLeft,
                    in_grace_period: true,
                    expires_at: this.currentLicense.expires_at,
                    message: `License expired. ${graceDaysLeft} days left in grace period`,
                    severity: 'warning',
                    action_required: true
                };
            } else if (daysRemaining <= 0) {
                return {
                    status: 'just_expired',
                    days_remaining: daysRemaining,
                    in_grace_period: false,
                    expires_at: this.currentLicense.expires_at,
                    message: 'License expired today',
                    severity: 'critical',
                    action_required: true
                };
            } else if (daysRemaining <= 7) {
                return {
                    status: 'expiring_soon',
                    days_remaining: daysRemaining,
                    in_grace_period: false,
                    expires_at: this.currentLicense.expires_at,
                    message: `License expires in ${daysRemaining} days`,
                    severity: 'critical',
                    action_required: true
                };
            } else if (daysRemaining <= 30) {
                return {
                    status: 'expiring_soon',
                    days_remaining: daysRemaining,
                    in_grace_period: false,
                    expires_at: this.currentLicense.expires_at,
                    message: `License expires in ${daysRemaining} days`,
                    severity: 'warning',
                    action_required: false
                };
            } else {
                return {
                    status: 'active',
                    days_remaining: daysRemaining,
                    in_grace_period: false,
                    expires_at: this.currentLicense.expires_at,
                    message: 'License is active',
                    severity: 'info',
                    action_required: false
                };
            }
        } catch (error) {
            console.error('Exception getting license status:', error);
            return null;
        }
    }

    /**
     * Check if a license expiry date is in grace period
     * Grace period is 30 days after expiry
     */
    isInGracePeriod(expiryDate) {
        const expiry = new Date(expiryDate);
        const now = new Date();
        const thirtyDaysAfterExpiry = new Date(expiry);
        thirtyDaysAfterExpiry.setDate(thirtyDaysAfterExpiry.getDate() + 30);
        
        return expiry < now && now <= thirtyDaysAfterExpiry;
    }

    /**
     * Check license expiration and show appropriate banner
     */
    async checkAndShowExpirationBanner() {
        const status = await this.getLicenseStatus();
        
        if (!status) return;

        // Update Account Overview section with license status
        this.updateAccountOverviewStatus(status);

        // Remove any existing banners
        this.removeBanner();

        // Show banner based on status
        switch (status.status) {
            case 'expired':
                this.showExpiredBanner(status);
                break;
            case 'grace_period':
                this.showGracePeriodBanner(status);
                break;
            case 'just_expired':
                this.showJustExpiredBanner(status);
                break;
            case 'expiring_soon':
                if (status.days_remaining <= 30) {
                    this.showExpiringSoonBanner(status);
                }
                break;
        }

        // Record that dashboard banner was shown
        if (status.action_required) {
            await this.recordNotification(status);
        }
    }

    /**
     * Update Account Overview section with license status
     */
    updateAccountOverviewStatus(status) {
        const statusElement = document.getElementById('licenseStatus');
        if (!statusElement) return;

        let statusHTML = '';
        let statusClass = '';

        switch (status.status) {
            case 'expired':
                statusClass = 'status-critical';
                statusHTML = `🚫 <span style="color: #dc3545;">Expired ${Math.abs(status.days_remaining)} days ago</span>`;
                break;
            case 'grace_period':
                statusClass = 'status-warning';
                statusHTML = `⚠️ <span style="color: #ff6b35;">Grace Period (${status.grace_days_left} days left)</span>`;
                break;
            case 'just_expired':
                statusClass = 'status-critical';
                statusHTML = `⚠️ <span style="color: #dc3545;">Expired Today</span>`;
                break;
            case 'expiring_soon':
                if (status.days_remaining <= 7) {
                    statusClass = 'status-critical';
                    statusHTML = `🔴 <span style="color: #dc3545;">Expires in ${status.days_remaining} days</span>`;
                } else {
                    statusClass = 'status-warning';
                    statusHTML = `⚠️ <span style="color: #ff8c42;">Expires in ${status.days_remaining} days</span>`;
                }
                break;
            case 'active':
                statusClass = 'status-active';
                statusHTML = `✅ <span style="color: #28a745;">Active (${status.days_remaining} days remaining)</span>`;
                break;
            case 'no_license':
                statusClass = 'status-none';
                statusHTML = `<span style="color: #6c757d;">No license found</span>`;
                break;
            default:
                statusHTML = `<span style="color: #6c757d;">${status.message}</span>`;
        }

        statusElement.innerHTML = statusHTML;
        statusElement.className = statusClass;

        // Add renewal button for critical statuses
        const infoElement = document.getElementById('licenseExpiryInfo');
        if (infoElement && status.action_required) {
            let renewBtn = document.getElementById('renewLicenseFromOverview');
            if (!renewBtn) {
                renewBtn = document.createElement('button');
                renewBtn.id = 'renewLicenseFromOverview';
                renewBtn.className = 'btn btn-danger btn-small';
                renewBtn.style.marginLeft = '10px';
                renewBtn.textContent = 'Renew Now';
                renewBtn.onclick = () => this.openRenewalFlow();
                statusElement.appendChild(renewBtn);
            }
        }
    }

    /**
     * Show banner for expired license (>30 days)
     */
    showExpiredBanner(status) {
        const banner = this.createBanner({
            type: 'expired',
            icon: '🚫',
            title: 'License Expired',
            message: `Your license expired ${Math.abs(status.days_remaining)} days ago. Access has been suspended.`,
            actionText: 'Renew Now',
            actionClass: 'btn-danger',
            severity: 'critical'
        });

        this.insertBanner(banner);
    }

    /**
     * Show banner for license in grace period
     */
    showGracePeriodBanner(status) {
        const banner = this.createBanner({
            type: 'grace-period',
            icon: '⚠️',
            title: 'License Expired - Grace Period Active',
            message: `Your license has expired. You have ${status.grace_days_left} days remaining in your grace period with limited functionality.`,
            actionText: 'Renew License',
            actionClass: 'btn-warning',
            severity: 'warning'
        });

        this.insertBanner(banner);
    }

    /**
     * Show banner for just expired license
     */
    showJustExpiredBanner(status) {
        const banner = this.createBanner({
            type: 'just-expired',
            icon: '⚠️',
            title: 'License Expired Today',
            message: 'Your license expired today. You have a 30-day grace period. Please renew to maintain full access.',
            actionText: 'Renew Now',
            actionClass: 'btn-warning',
            severity: 'critical'
        });

        this.insertBanner(banner);
    }

    /**
     * Show banner for expiring soon
     */
    showExpiringSoonBanner(status) {
        const severity = status.days_remaining <= 7 ? 'critical' : 'warning';
        const icon = status.days_remaining <= 7 ? '🔴' : '⚠️';
        
        const banner = this.createBanner({
            type: 'expiring-soon',
            icon: icon,
            title: `License Expires in ${status.days_remaining} Days`,
            message: 'Renew now to ensure uninterrupted access to MepSketcher.',
            actionText: 'Renew License',
            actionClass: severity === 'critical' ? 'btn-danger' : 'btn-warning',
            severity: severity
        });

        this.insertBanner(banner);
    }

    /**
     * Create banner element
     */
    createBanner({ type, icon, title, message, actionText, actionClass, severity }) {
        const banner = document.createElement('div');
        banner.className = `license-expiration-banner ${severity}`;
        banner.id = 'license-expiration-banner';
        banner.innerHTML = `
            <div class="banner-content">
                <span class="banner-icon">${icon}</span>
                <div class="banner-text">
                    <strong>${title}</strong>
                    <p>${message}</p>
                </div>
                <button class="btn ${actionClass}" id="renewLicenseBtn">
                    ${actionText}
                </button>
                <button class="btn btn-text" id="dismissBannerBtn" title="Dismiss">
                    ✕
                </button>
            </div>
        `;

        return banner;
    }

    /**
     * Insert banner at top of dashboard
     */
    insertBanner(banner) {
        const dashboardContent = document.querySelector('.dashboard-content') || 
                                document.querySelector('.content') ||
                                document.querySelector('main');
        
        if (dashboardContent) {
            dashboardContent.insertBefore(banner, dashboardContent.firstChild);
        }
    }

    /**
     * Remove existing banner
     */
    removeBanner() {
        const existingBanner = document.getElementById('license-expiration-banner');
        if (existingBanner) {
            existingBanner.remove();
        }
    }

    /**
     * Setup event listeners for renewal actions
     */
    setupRenewalListeners() {
        // Use event delegation for dynamic elements
        document.addEventListener('click', (e) => {
            if (e.target.id === 'renewLicenseBtn' || e.target.closest('#renewLicenseBtn')) {
                e.preventDefault();
                this.openRenewalFlow();
            }
            
            if (e.target.id === 'dismissBannerBtn' || e.target.closest('#dismissBannerBtn')) {
                e.preventDefault();
                this.removeBanner();
            }
        });
    }

    /**
     * Open renewal flow modal
     */
    async openRenewalFlow() {
        const status = await this.getLicenseStatus();
        const license = this.currentLicense || await this.loadLicenseInfo();

        if (!license) {
            alert('Unable to load license information. Please refresh and try again.');
            return;
        }

        // Determine renewal type
        let renewalType = 'standard';
        if (status) {
            switch (status.status) {
                case 'expired':
                    renewalType = 'new_purchase';
                    break;
                case 'grace_period':
                case 'just_expired':
                    renewalType = 'grace_period';
                    break;
                case 'expiring_soon':
                    if (status.days_remaining > 0) {
                        renewalType = 'early_renewal';
                    }
                    break;
            }
        }

        this.showRenewalModal(license, renewalType, status);
    }

    /**
     * Show renewal modal
     */
    showRenewalModal(license, renewalType, status) {
        const modal = document.createElement('div');
        modal.className = 'modal renewal-modal';
        modal.id = 'renewalModal';

        const currentExpiry = new Date(license.expires_at);
        const newExpiry = this.calculateNewExpiry(license, renewalType);
        const pricePerLicense = 200; // $200 per license per year
        const totalPrice = license.total_licenses * pricePerLicense;

        // Renewal type descriptions
        const renewalDescriptions = {
            'standard': 'Standard renewal for 1 year',
            'grace_period': 'Renew from original expiry date',
            'early_renewal': 'Extend license from today',
            'new_purchase': 'New license (expired >30 days ago)'
        };

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Renew Your License</h2>
                    <span class="close" id="closeRenewalModal">&times;</span>
                </div>
                <div class="modal-body">
                    ${status && status.severity === 'critical' ? `
                        <div class="alert alert-danger">
                            <strong>Action Required:</strong> ${status.message}
                        </div>
                    ` : ''}
                    
                    <div class="renewal-summary">
                        <h3>Renewal Summary</h3>
                        <div class="summary-row">
                            <span>Current License Count:</span>
                            <span><strong>${license.total_licenses} licenses</strong></span>
                        </div>
                        <div class="summary-row">
                            <span>Current Expiry:</span>
                            <span>${currentExpiry.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                        <div class="summary-row">
                            <span>New Expiry:</span>
                            <span><strong>${newExpiry.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                        </div>
                        <div class="summary-row">
                            <span>Renewal Type:</span>
                            <span>${renewalDescriptions[renewalType]}</span>
                        </div>
                        <div class="summary-row total">
                            <span><strong>Total Price:</strong></span>
                            <span class="price"><strong>$${totalPrice.toFixed(2)}</strong></span>
                        </div>
                    </div>
                    
                    <div class="renewal-options">
                        <h4>Renewal Options</h4>
                        <label class="radio-option">
                            <input type="radio" name="renewal-option" value="same" checked>
                            <div>
                                <strong>Renew ${license.total_licenses} licenses</strong>
                                <p>Keep your current license count</p>
                                <span class="option-price">$${totalPrice.toFixed(2)}</span>
                            </div>
                        </label>
                        <label class="radio-option">
                            <input type="radio" name="renewal-option" value="add">
                            <div>
                                <strong>Add more licenses</strong>
                                <p>Increase your team capacity</p>
                                <div class="license-input-group">
                                    <input type="number" id="additionalLicenses" min="1" max="1000" value="5" 
                                           placeholder="Additional licenses">
                                    <span class="input-hint">Current: ${license.total_licenses} + Additional</span>
                                </div>
                            </div>
                        </label>
                    </div>

                    ${renewalType === 'early_renewal' ? `
                        <div class="alert alert-info">
                            <strong>Note:</strong> Early renewal will extend your license from today. 
                            You will not receive credit for unused time on your current license.
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancelRenewal">Cancel</button>
                    <button class="btn btn-primary" id="proceedToPayment">
                        Proceed to Payment
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup event listeners
        this.setupModalListeners(modal, license, renewalType);
    }

    /**
     * Setup modal event listeners
     */
    setupModalListeners(modal, license, renewalType) {
        // Close button
        modal.querySelector('#closeRenewalModal').addEventListener('click', () => {
            this.closeRenewalModal();
        });

        // Cancel button
        modal.querySelector('#cancelRenewal').addEventListener('click', () => {
            this.closeRenewalModal();
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeRenewalModal();
            }
        });

        // Proceed to payment
        modal.querySelector('#proceedToPayment').addEventListener('click', () => {
            this.processRenewal(license, renewalType);
        });

        // Update price when additional licenses change
        modal.querySelector('#additionalLicenses')?.addEventListener('input', (e) => {
            // Could update price display here
        });
    }

    /**
     * Close renewal modal
     */
    closeRenewalModal() {
        const modal = document.getElementById('renewalModal');
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Process renewal and open Paddle checkout
     */
    async processRenewal(license, renewalType) {
        const option = document.querySelector('input[name="renewal-option"]:checked').value;
        const additionalLicenses = option === 'add' 
            ? parseInt(document.getElementById('additionalLicenses').value) || 0
            : 0;

        const totalLicenses = license.total_licenses + additionalLicenses;

        if (totalLicenses < 1 || totalLicenses > 1000) {
            alert('Please enter a valid number of licenses (1-1000)');
            return;
        }

        // Store renewal info in session for webhook processing
        const renewalInfo = {
            licenseId: license.id,
            organizationId: this.organizationId,
            renewalType: renewalType,
            totalLicenses: totalLicenses,
            originalLicenses: license.total_licenses,
            additionalLicenses: additionalLicenses,
            timestamp: new Date().toISOString()
        };

        sessionStorage.setItem('pendingRenewal', JSON.stringify(renewalInfo));

        // Close modal
        this.closeRenewalModal();

        // Open Paddle checkout
        if (typeof mepSketcherLicensing === 'undefined' || !mepSketcherLicensing) {
            alert('Payment system not available. Please try again later.');
            console.error('mepSketcherLicensing not initialized');
            return;
        }

        // Open Paddle checkout with renewal context
        mepSketcherLicensing.purchaseYearlyLicense(totalLicenses);
    }

    /**
     * Calculate new expiry date based on renewal type
     */
    calculateNewExpiry(license, renewalType) {
        const now = new Date();
        const currentExpiry = new Date(license.expires_at);

        switch (renewalType) {
            case 'grace_period':
                // Extend 1 year from original expiry
                return new Date(
                    currentExpiry.getFullYear() + 1,
                    currentExpiry.getMonth(),
                    currentExpiry.getDate()
                );

            case 'early_renewal':
            case 'standard':
            case 'new_purchase':
            default:
                // 1 year from now
                return new Date(
                    now.getFullYear() + 1,
                    now.getMonth(),
                    now.getDate()
                );
        }
    }

    /**
     * Record notification in database (direct insert)
     */
    async recordNotification(status) {
        if (!this.currentLicense) return;

        try {
            // Determine notification type
            let notificationType;
            if (status.days_remaining <= 1 && status.days_remaining >= 0) {
                notificationType = '1_day';
            } else if (status.days_remaining <= 7 && status.days_remaining > 1) {
                notificationType = '7_day';
            } else if (status.days_remaining <= 14 && status.days_remaining > 7) {
                notificationType = '14_day';
            } else if (status.days_remaining <= 30 && status.days_remaining > 14) {
                notificationType = '30_day';
            } else if (status.days_remaining < 0) {
                notificationType = 'expired';
            }

            if (notificationType) {
                // Check if already recorded today
                const today = new Date().toISOString().split('T')[0];
                const { data: existing } = await this.supabase
                    .from('license_notifications')
                    .select('id')
                    .eq('organization_id', this.organizationId)
                    .eq('license_id', this.currentLicense.id)
                    .eq('notification_type', notificationType)
                    .gte('sent_at', today)
                    .maybeSingle();

                if (!existing) {
                    // Insert new notification
                    await this.supabase
                        .from('license_notifications')
                        .insert({
                            organization_id: this.organizationId,
                            license_id: this.currentLicense.id,
                            notification_type: notificationType,
                            dashboard_shown: true,
                            email_sent: false
                        });
                }
            }
        } catch (error) {
            console.error('Error recording notification:', error);
        }
    }

    /**
     * Show license details in license card
     */
    getExpirationStatusHTML() {
        if (!this.currentLicense) return '';

        const expiresAt = new Date(this.currentLicense.expires_at);
        const now = new Date();
        const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < -30) {
            return `<span class="expiration-status critical">Expired ${Math.abs(daysUntilExpiry)} days ago</span>`;
        } else if (daysUntilExpiry < 0) {
            return `<span class="expiration-status warning">Grace period (${30 + daysUntilExpiry} days left)</span>`;
        } else if (daysUntilExpiry <= 7) {
            return `<span class="expiration-status critical">Expires in ${daysUntilExpiry} days</span>`;
        } else if (daysUntilExpiry <= 30) {
            return `<span class="expiration-status warning">Expires in ${daysUntilExpiry} days</span>`;
        } else {
            return `<span class="expiration-status success">Active</span>`;
        }
    }
}

// Export for use in dashboard
window.LicenseExpirationManager = LicenseExpirationManager;
