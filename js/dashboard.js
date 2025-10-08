// Dashboard JavaScript
// Handles dashboard functionality and license management

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth service to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if user is authenticated
    if (!authService.isAuthenticated()) {
        console.log('User not authenticated, redirecting to login...');
        window.location.href = 'login.html';
        return;
    }

    // Load user data
    await loadUserData();

    // Set up event listeners
    setupEventListeners();

    // Load licenses
    await loadLicenses();
});

// Load user data
async function loadUserData() {
    const user = authService.getCurrentUser();
    
    if (!user) return;

    // Update user info in header
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');

    const displayName = user.user_metadata?.name || user.email.split('@')[0];
    userName.textContent = displayName;
    userEmail.textContent = user.email;
    
    // Set avatar initial
    userAvatar.textContent = displayName.charAt(0).toUpperCase();

    // Update account overview card
    document.getElementById('accountEmail').textContent = user.email;
    document.getElementById('emailVerified').textContent = user.email_confirmed_at ? 'Yes ✓' : 'No ✗';
    
    // Format member since date
    const createdDate = new Date(user.created_at);
    document.getElementById('memberSince').textContent = createdDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Set up event listeners
function setupEventListeners() {
    // Sign out button
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const result = await authService.signOut();
            
            if (result.success) {
                window.location.href = 'index.html';
            } else {
                alert('Failed to sign out. Please try again.');
            }
        });
    }

    // Update profile button
    const updateProfileBtn = document.getElementById('updateProfileBtn');
    if (updateProfileBtn) {
        updateProfileBtn.addEventListener('click', () => {
            // TODO: Implement profile update modal
            alert('Profile update feature coming soon!');
        });
    }

    // Buy license buttons
    const buyLicenseButtons = [
        document.getElementById('buyLicenseBtn'),
        document.getElementById('buyLicenseBtn2')
    ];
    
    buyLicenseButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                handleBuyLicense();
            });
        }
    });
}

// Load licenses from Supabase
async function loadLicenses() {
    try {
        const user = authService.getCurrentUser();
        if (!user) return;

        // Query licenses table
        const { data: licenses, error } = await authService.supabase
            .from('licenses')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading licenses:', error);
            return;
        }

        // Update license counts
        const activeLicenses = licenses?.filter(l => 
            l.is_active && new Date(l.expiry_date) > new Date()
        ).length || 0;
        
        document.getElementById('activeLicenses').textContent = activeLicenses;
        document.getElementById('totalLicenses').textContent = licenses?.length || 0;

        // Display licenses
        displayLicenses(licenses);
    } catch (error) {
        console.error('Error in loadLicenses:', error);
    }
}

// Display licenses
function displayLicenses(licenses) {
    const container = document.getElementById('licensesContainer');
    
    if (!licenses || licenses.length === 0) {
        // Show empty state (already in HTML)
        return;
    }

    // Clear container
    container.innerHTML = '';

    // Create license list
    const licenseList = document.createElement('ul');
    licenseList.className = 'license-list';

    licenses.forEach(license => {
        const licenseItem = createLicenseItem(license);
        licenseList.appendChild(licenseItem);
    });

    container.appendChild(licenseList);
}

// Create license item HTML
function createLicenseItem(license) {
    const li = document.createElement('li');
    li.className = 'license-item';

    const isActive = license.is_active && new Date(license.expiry_date) > new Date();
    const statusClass = isActive ? 'active' : 'expired';
    const statusText = isActive ? 'Active' : 'Expired';

    const expiryDate = new Date(license.expiry_date);
    const formattedExpiry = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const purchaseDate = new Date(license.purchase_date || license.created_at);
    const formattedPurchase = purchaseDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    li.innerHTML = `
        <div class="license-item-header">
            <span class="license-type">${license.product_type || 'Standard'} License</span>
            <span class="license-status ${statusClass}">${statusText}</span>
        </div>
        <div class="license-details">
            <p><strong>License Key:</strong> ${license.license_key}</p>
            <p><strong>Purchased:</strong> ${formattedPurchase}</p>
            <p><strong>Expires:</strong> ${formattedExpiry}</p>
            <p><strong>Activations:</strong> ${license.current_activations || 0} / ${license.max_activations || 1}</p>
        </div>
        <div class="license-actions">
            ${isActive ? '<button class="btn btn-secondary btn-small copy-key-btn">Copy Key</button>' : ''}
            ${!isActive ? '<button class="btn btn-primary btn-small renew-btn">Renew License</button>' : ''}
            <button class="btn btn-secondary btn-small extend-btn">Extend License</button>
        </div>
    `;

    // Add event listeners to buttons
    const copyKeyBtn = li.querySelector('.copy-key-btn');
    if (copyKeyBtn) {
        copyKeyBtn.addEventListener('click', () => {
            copyToClipboard(license.license_key);
        });
    }

    const renewBtn = li.querySelector('.renew-btn');
    if (renewBtn) {
        renewBtn.addEventListener('click', () => {
            handleRenewLicense(license);
        });
    }

    const extendBtn = li.querySelector('.extend-btn');
    if (extendBtn) {
        extendBtn.addEventListener('click', () => {
            handleExtendLicense(license);
        });
    }

    return li;
}

// Copy text to clipboard
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('License key copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy license key');
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            alert('License key copied to clipboard!');
        } catch (err) {
            alert('Failed to copy license key');
        }
        document.body.removeChild(textArea);
    }
}

// Handle buy license
function handleBuyLicense() {
    // TODO: Integrate with payment provider (Stripe/Paddle)
    alert('Purchase functionality coming soon!\n\nWe will integrate with Stripe or Paddle for secure payments.');
}

// Handle renew license
function handleRenewLicense(license) {
    // TODO: Implement license renewal
    alert(`Renewing license: ${license.license_key}\n\nRenewal functionality coming soon!`);
}

// Handle extend license
function handleExtendLicense(license) {
    // TODO: Implement license extension
    alert(`Extending license: ${license.license_key}\n\nExtension functionality coming soon!`);
}
