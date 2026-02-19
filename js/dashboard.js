// Dashboard JavaScript
// Handles dashboard functionality, license management, and organization management

import { MembersManager } from './members-manager.js';

// Global members manager instance
let membersManager = null;

// Global license expiration manager instance
let licenseExpirationManager = null;

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

    // Load organization data
    await loadOrganizationData();

    // Load licenses
    await loadLicenses();

    // Setup add member modal
    setupAddMemberModal();

    // Setup edit organization name modal
    setupEditOrgNameModal();

    // Setup purchase licenses modal
    setupPurchaseLicensesModal();

    // Setup license management modal
    setupLicenseManagementModal();
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
    userName.textContent = `Welcome back, ${displayName}!`;
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
            
            console.log('Sign out button clicked');
            
            const result = await authService.signOut();
            
            if (result.success) {
                console.log('Sign out successful, redirecting...');
                window.location.href = 'index.html';
            } else {
                console.error('Sign out failed:', result.error);
                
                // Show user-friendly message
                const shouldForceLogout = confirm(
                    'Failed to sign out properly. Would you like to force logout? ' +
                    'This will clear all local data and redirect you to the home page.'
                );
                
                if (shouldForceLogout) {
                    console.log('User requested force logout');
                    
                    // Force clear everything using the proper method
                    authService.currentUser = null;
                    authService.clearAllSupabaseData();
                    
                    // Redirect immediately
                    window.location.href = 'index.html';
                }
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
}

// Load organization data
async function loadOrganizationData() {
    try {
        const user = authService.getCurrentUser();
        if (!user) return;

        // Get user's organizations (as owner)
        const { data: ownedOrgs, error: ownedError } = await authService.supabase
            .from('organizations')
            .select('*')
            .eq('owner_id', user.id);

        if (ownedError) {
            console.error('Error loading owned organizations:', ownedError);
        }

        // Get organizations where user is a member (just get the IDs and roles)
        // Only get active memberships
        const { data: memberships, error: membershipsError } = await authService.supabase
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user.id)
            .eq('status', 'active'); // Only load active memberships

        if (membershipsError) {
            console.error('Error loading memberships:', membershipsError);
        }

        // Get the full organization details for memberships
        let memberOrgs = [];
        if (memberships && memberships.length > 0) {
            const orgIds = memberships.map(m => m.organization_id);
            
            const { data: orgs, error: orgsError } = await authService.supabase
                .from('organizations')
                .select('*')
                .in('id', orgIds);

            if (orgsError) {
                console.error('Error loading member organizations:', orgsError);
            } else {
                // Map the organizations with their roles
                memberOrgs = orgs ? orgs.map(org => {
                    const membership = memberships.find(m => m.organization_id === org.id);
                    return {
                        ...org,
                        role: membership?.role || 'member',
                        isOwner: false
                    };
                }) : [];
            }
        }

        // Combine organizations
        const allOrgs = [
            ...(ownedOrgs || []).map(org => ({ 
                ...org, 
                role: 'admin', 
                isOwner: true 
            })),
            ...memberOrgs
        ];

        // Remove duplicates (in case user is both owner and member)
        const uniqueOrgs = Array.from(
            new Map(allOrgs.map(org => [org.id, org])).values()
        );

        if (uniqueOrgs.length > 0) {
            displayOrganizationInfo(uniqueOrgs[0]); // Show first organization
        } else {
            // Optionally show a message in the UI
            const container = document.getElementById('organizationContainer');
            if (container) {
                container.innerHTML = '<div class="empty-state"><p>No organization found. Contact an administrator to be added to an organization.</p></div>';
            }
        }
    } catch (error) {
        console.error('Error in loadOrganizationData:', error);
    }
}

// Display organization information
async function displayOrganizationInfo(org) {
    const container = document.getElementById('organizationContainer');
    container.innerHTML = '';

    const user = authService.getCurrentUser();
    const isAdmin = org.role === 'admin' || org.owner_id === user.id;

    const orgDiv = document.createElement('div');
    orgDiv.className = 'organization-info';

    let membersHtml = '';
    let licenseInfoHtml = '';
    
    // Initialize members manager
    membersManager = new MembersManager(authService.supabase, org.id);
    
    // Load organization members (for both admin and non-admin users)
    // Only load active members
    const { data: members, error: membersError } = await authService.supabase
        .from('organization_members')
        .select('user_id, email, role, created_at')
        .eq('organization_id', org.id)
        .eq('status', 'active'); // Only show active members

    if (membersError) {
        console.error('Error loading members:', membersError);
    }
    
    if (isAdmin) {
        
        // Load license availability info
        try {
            const licenseInfo = await membersManager.checkAvailableLicenses();
            
            if (licenseInfo && licenseInfo.success) {
                const canAddMember = licenseInfo.can_add_member;
                const availableCount = licenseInfo.available_licenses || 0;
                
                licenseInfoHtml = `
                    <div class="license-info-banner ${canAddMember ? 'success' : 'warning'}">
                        ${canAddMember 
                            ? `✓ ${availableCount} license${availableCount !== 1 ? 's' : ''} available for new members`
                            : `⚠ ${licenseInfo.message || 'No licenses available'}`
                        }
                    </div>
                `;
            } else if (licenseInfo && !licenseInfo.success) {
                console.warn('License check returned error:', licenseInfo.error);
                // Don't show banner if there's an error, just log it
            }
        } catch (error) {
            console.error('Error checking license availability:', error);
            // Continue without license banner - don't break the UI
        }

        if (members && members.length > 0) {
            membersHtml = `
                <div class="org-members-section">
                    ${licenseInfoHtml}
                    <div class="members-header">
                        <h3>Organization Members (${members.length})</h3>
                        <button class="btn btn-primary btn-small" id="addMemberBtn">
                            + Add Member
                        </button>
                    </div>
                    <div class="org-members-list">
                        ${members.map(member => {
                            const displayEmail = member.email || 'Unknown';
                            const displayName = displayEmail.split('@')[0];
                            const isCurrentUser = member.user_id === user.id;
                            
                            return `
                                <div class="org-member-item">
                                    <div class="member-info">
                                        <div class="member-details">
                                            <span class="member-name">${displayName}</span>
                                            <span class="member-email">${displayEmail}</span>
                                        </div>
                                        <span class="member-role ${member.role}">${member.role}</span>
                                    </div>
                                    ${!isCurrentUser ? `
                                        <button class="btn btn-danger btn-small remove-member-btn" 
                                                data-user-id="${member.user_id}" 
                                                data-member-name="${displayName}"
                                                data-org-id="${org.id}">
                                            Remove
                                        </button>
                                    ` : '<span class="member-you-badge">You</span>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    } else {
        // Non-admin view - show members list without management controls
        
        if (members && members.length > 0) {
            membersHtml = `
                <div class="org-members-section">
                    <div class="members-header">
                        <h3>Organization Members (${members.length})</h3>
                    </div>
                    <div class="org-members-list">
                        ${members.map(member => {
                            const displayEmail = member.email || 'Unknown';
                            const displayName = displayEmail.split('@')[0];
                            const isCurrentUser = member.user_id === user.id;
                            
                            return `
                                <div class="org-member-item">
                                    <div class="member-info">
                                        <div class="member-details">
                                            <span class="member-name">${displayName}</span>
                                            <span class="member-email">${displayEmail}</span>
                                        </div>
                                        <span class="member-role ${member.role}">${member.role}</span>
                                    </div>
                                    ${isCurrentUser ? '<span class="member-you-badge">You</span>' : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    }

    orgDiv.innerHTML = `
        <div class="org-header">
            <div>
                <h3 class="org-name">${org.name}</h3>
                <p class="org-role">Your role: <span class="role-badge ${org.role}">${org.role}</span></p>
            </div>
            ${isAdmin ? `
                <button class="btn btn-secondary btn-small" id="editOrgNameBtn">
                    Edit Name
                </button>
            ` : ''}
        </div>
        ${membersHtml}
    `;

    container.appendChild(orgDiv);

    // Add event listeners for member management
    if (isAdmin) {
        // Edit organization name button
        const editOrgNameBtn = document.getElementById('editOrgNameBtn');
        if (editOrgNameBtn) {
            editOrgNameBtn.addEventListener('click', () => {
                openEditOrgNameModal(org);
            });
        }

        // Add member button
        const addMemberBtn = document.getElementById('addMemberBtn');
        if (addMemberBtn) {
            addMemberBtn.addEventListener('click', async () => {
                await openAddMemberModal();
            });
        }
        
        // Remove member buttons
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                handleRemoveMember(btn.dataset.userId, btn.dataset.memberName, btn.dataset.orgId);
            });
        });
    }
}

// Setup Add Member Modal
function setupAddMemberModal() {
    const modal = document.getElementById('addMemberModal');
    const closeBtn = modal.querySelector('.close');
    const cancelBtn = document.getElementById('cancelAddMember');
    const form = document.getElementById('addMemberForm');

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeAddMemberModal();
        });
    }

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeAddMemberModal();
        });
    }

    // Click outside to close
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeAddMemberModal();
        }
    });

    // Form submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleAddMemberSubmit();
        });
    }
}

// Open Add Member Modal
async function openAddMemberModal() {
    if (!membersManager) {
        showAddMemberMessage('Error: Member manager not initialized', 'error');
        return;
    }

    try {
        // Check license availability before opening modal
        const licenseInfo = await membersManager.checkAvailableLicenses();
        
        if (!licenseInfo.success) {
            alert(licenseInfo.error || 'Failed to check license availability');
            return;
        }

        if (!licenseInfo.can_add_member) {
            alert(licenseInfo.message || 'Cannot add members at this time. Please check your license status.');
            return;
        }

        // Open modal
        const modal = document.getElementById('addMemberModal');
        modal.style.display = 'flex';
        
        // Focus email input
        document.getElementById('memberEmail').focus();
    } catch (error) {
        console.error('Error opening add member modal:', error);
        alert('Failed to check license availability. Please try again.');
    }
}

// Close Add Member Modal
function closeAddMemberModal() {
    const modal = document.getElementById('addMemberModal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('addMemberForm').reset();
    
    // Hide message
    const messageDiv = document.getElementById('addMemberMessage');
    messageDiv.style.display = 'none';
    messageDiv.className = 'message';
}

// Handle Add Member Form Submit
async function handleAddMemberSubmit() {
    const emailInput = document.getElementById('memberEmail');
    const roleSelect = document.getElementById('memberRole');
    const submitBtn = document.getElementById('submitAddMember');
    
    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
        showAddMemberMessage('Please enter an email address', 'error');
        return;
    }

    if (!membersManager) {
        showAddMemberMessage('Error: Member manager not initialized', 'error');
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    try {
        const result = await membersManager.inviteMember(email, role);
        
        if (result.success) {
            showAddMemberMessage(result.message, 'success');
            
            // Reload organization data after 1.5 seconds
            setTimeout(async () => {
                await loadOrganizationData();
                await loadLicenses();
                closeAddMemberModal();
            }, 1500);
        } else {
            showAddMemberMessage(result.message || 'Failed to add member', 'error');
        }
    } catch (error) {
        console.error('Error adding member:', error);
        showAddMemberMessage(error.message || 'An error occurred while adding the member', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Member';
    }
}

// Show message in add member modal
function showAddMemberMessage(text, type) {
    const messageDiv = document.getElementById('addMemberMessage');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

// ============================================================================
// Organization Name Edit Modal Functions
// ============================================================================

// Setup Edit Organization Name Modal
function setupEditOrgNameModal() {
    const modal = document.getElementById('editOrgNameModal');
    const closeBtn = modal.querySelector('.close');
    const cancelBtn = document.getElementById('cancelEditOrgName');
    const form = document.getElementById('editOrgNameForm');

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeEditOrgNameModal();
        });
    }

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeEditOrgNameModal();
        });
    }

    // Click outside to close
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeEditOrgNameModal();
        }
    });

    // Form submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleEditOrgNameSubmit();
        });
    }
}

// Variable to store current organization being edited
let currentEditingOrg = null;

// Open Edit Organization Name Modal
function openEditOrgNameModal(org) {
    if (!org) {
        alert('Error: Organization not found');
        return;
    }

    // Store the organization for later use
    currentEditingOrg = org;

    // Set the current name in the input
    const orgNameInput = document.getElementById('orgNameInput');
    orgNameInput.value = org.name;

    // Open modal
    const modal = document.getElementById('editOrgNameModal');
    modal.style.display = 'flex';
    
    // Focus input and select text for easy editing
    orgNameInput.focus();
    orgNameInput.select();
}

// Close Edit Organization Name Modal
function closeEditOrgNameModal() {
    const modal = document.getElementById('editOrgNameModal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('editOrgNameForm').reset();
    
    // Hide message
    const messageDiv = document.getElementById('editOrgNameMessage');
    messageDiv.style.display = 'none';
    messageDiv.className = 'message';
    
    // Clear current editing org
    currentEditingOrg = null;
}

// Handle Edit Organization Name Form Submit
async function handleEditOrgNameSubmit() {
    const orgNameInput = document.getElementById('orgNameInput');
    const submitBtn = document.getElementById('submitEditOrgName');
    
    const newName = orgNameInput.value.trim();

    if (!newName) {
        showEditOrgNameMessage('Please enter an organization name', 'error');
        return;
    }

    if (!currentEditingOrg) {
        showEditOrgNameMessage('Error: Organization not found', 'error');
        return;
    }

    // Check if name has actually changed
    if (newName === currentEditingOrg.name) {
        showEditOrgNameMessage('No changes made', 'info');
        setTimeout(() => {
            closeEditOrgNameModal();
        }, 1500);
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        // Update organization name in Supabase
        const { error } = await authService.supabase
            .from('organizations')
            .update({
                name: newName,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentEditingOrg.id);

        if (error) {
            throw new Error(error.message);
        }

        showEditOrgNameMessage('Organization name updated successfully!', 'success');
        
        // Reload organization data after 1 second
        setTimeout(async () => {
            await loadOrganizationData();
            closeEditOrgNameModal();
        }, 1000);
    } catch (error) {
        console.error('Error updating organization name:', error);
        showEditOrgNameMessage(error.message || 'Failed to update organization name', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
    }
}

// Show message in edit organization name modal
function showEditOrgNameMessage(text, type) {
    const messageDiv = document.getElementById('editOrgNameMessage');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

// ============================================================================
// End Organization Name Edit Modal Functions
// ============================================================================

// ============================================================================
// Purchase Additional Licenses Modal Functions
// ============================================================================

// Setup Purchase Licenses Modal (call this in DOMContentLoaded)
function setupPurchaseLicensesModal() {
    const modal = document.getElementById('purchaseLicensesModal');
    const closeBtn = modal.querySelector('.close');
    const cancelBtn = document.getElementById('cancelPurchaseLicenses');
    const form = document.getElementById('purchaseLicensesForm');
    const quantityInput = document.getElementById('licenseQuantity');

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closePurchaseLicensesModal();
        });
    }

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closePurchaseLicensesModal();
        });
    }

    // Click outside to close
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closePurchaseLicensesModal();
        }
    });

    // Update pricing when quantity changes
    if (quantityInput) {
        quantityInput.addEventListener('input', () => {
            updatePricingPreview();
        });
    }

    // Form submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handlePurchaseLicensesSubmit();
        });
    }
}

// Variable to store current license being purchased for
let currentPurchaseLicense = null;

// Open Purchase Licenses Modal
function openPurchaseLicensesModal(license) {
    if (!license) {
        alert('Error: License not found');
        return;
    }

    // Store the license for later use
    currentPurchaseLicense = license;

    // Reset quantity to 1
    const quantityInput = document.getElementById('licenseQuantity');
    quantityInput.value = 1;

    // Update pricing preview
    updatePricingPreview();

    // Open modal
    const modal = document.getElementById('purchaseLicensesModal');
    modal.style.display = 'flex';
    
    // Focus quantity input
    quantityInput.focus();
    quantityInput.select();
}

// Close Purchase Licenses Modal
function closePurchaseLicensesModal() {
    const modal = document.getElementById('purchaseLicensesModal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('purchaseLicensesForm').reset();
    
    // Hide message
    const messageDiv = document.getElementById('purchaseLicensesMessage');
    messageDiv.style.display = 'none';
    messageDiv.className = 'message';
    
    // Clear current license
    currentPurchaseLicense = null;
}

// Update pricing preview in real-time
function updatePricingPreview() {
    if (!currentPurchaseLicense) return;

    const quantityInput = document.getElementById('licenseQuantity');
    const quantity = parseInt(quantityInput.value) || 1;

    // Calculate remaining days
    const expiresAt = new Date(currentPurchaseLicense.expires_at);
    const now = new Date();
    const remainingDays = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    // Calculate pricing (€200 base price per year)
    const dailyRate = 200 / 365;
    const pricePerLicense = Math.ceil(dailyRate * remainingDays * 100) / 100;
    const totalCost = Math.ceil(pricePerLicense * quantity * 100) / 100;

    // Update display
    document.getElementById('remainingDaysDisplay').textContent = `${remainingDays} days`;
    document.getElementById('pricePerLicenseDisplay').textContent = `€${pricePerLicense.toFixed(2)}`;
    document.getElementById('quantityDisplay').textContent = quantity;
    document.getElementById('totalCostDisplay').textContent = `€${totalCost.toFixed(2)}`;
    document.getElementById('renewalDateDisplay').textContent = expiresAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Handle Purchase Licenses Form Submit
async function handlePurchaseLicensesSubmit() {
    if (!currentPurchaseLicense) {
        showPurchaseLicensesMessage('Error: No license selected', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitPurchaseLicenses');
    const quantityInput = document.getElementById('licenseQuantity');
    const quantity = parseInt(quantityInput.value);

    // Validation
    if (isNaN(quantity) || quantity < 1 || quantity > 100) {
        showPurchaseLicensesMessage('Please enter a valid quantity between 1 and 100', 'error');
        return;
    }

    // Check if license has subscription_id
    if (!currentPurchaseLicense.subscription_id) {
        showPurchaseLicensesMessage('Error: No subscription found for this license', 'error');
        return;
    }

    // Save license values before closing modal (closing sets currentPurchaseLicense to null)
    const organizationId = currentPurchaseLicense.organization_id;
    const subscriptionId = currentPurchaseLicense.subscription_id;

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
        // Close modal
        closePurchaseLicensesModal();
        
        // Call the dedicated add licenses function
        if (typeof mepSketcherLicensing !== 'undefined') {
            await mepSketcherLicensing.addLicensesToSubscription(
                quantity,
                organizationId,
                subscriptionId
            );
        } else {
            throw new Error('Payment system not available');
        }
    } catch (error) {
        console.error('Error purchasing licenses:', error);
        alert(`Error: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Purchase Licenses';
    }
}

// Show message in purchase licenses modal
function showPurchaseLicensesMessage(text, type) {
    const messageDiv = document.getElementById('purchaseLicensesMessage');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

// ============================================================================
// End Purchase Additional Licenses Modal Functions
// ============================================================================

// ============================================================================
// License Management Modal Functions (Add/Reduce Licenses)
// ============================================================================

// Setup License Management Modal (call this in DOMContentLoaded)
function setupLicenseManagementModal() {
    const modal = document.getElementById('licenseManagementModal');
    const closeBtn = modal?.querySelector('.close');
    const cancelBtn = document.getElementById('cancelLicenseManagement');
    const form = document.getElementById('licenseManagementForm');
    const quantityInput = document.getElementById('newLicenseQuantity');
    const incrementBtn = document.getElementById('incrementLicenses');
    const decrementBtn = document.getElementById('decrementLicenses');

    if (!modal) return; // Modal not found, skip setup

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeLicenseManagementModal();
        });
    }

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeLicenseManagementModal();
        });
    }

    // Click outside to close
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeLicenseManagementModal();
        }
    });

    // Increment/Decrement buttons
    if (incrementBtn && quantityInput) {
        incrementBtn.addEventListener('click', () => {
            const currentValue = parseInt(quantityInput.value) || 0;
            quantityInput.value = Math.min(currentValue + 1, 200);
            updateLicenseChangePreview();
        });
    }

    if (decrementBtn && quantityInput) {
        decrementBtn.addEventListener('click', () => {
            const currentValue = parseInt(quantityInput.value) || 0;
            quantityInput.value = Math.max(currentValue - 1, 0);
            updateLicenseChangePreview();
        });
    }

    // Update preview when quantity changes
    if (quantityInput) {
        quantityInput.addEventListener('input', () => {
            updateLicenseChangePreview();
        });
    }

    // Form submit
    if (form) {
        form.addEventListener('submit', handleLicenseManagementSubmit);
    }
}

// Variable to store current license being managed
let currentManagedLicense = null;

// Open License Management Modal
function openLicenseManagementModal(license) {
    if (!license) {
        alert('Error: License not found');
        return;
    }

    // Store the license for later use
    currentManagedLicense = license;

    // Populate current status
    document.getElementById('currentTotalLicenses').textContent = license.total_licenses || 0;
    document.getElementById('currentUsedLicenses').textContent = license.used_licenses || 0;
    document.getElementById('currentAvailableLicenses').textContent = (license.total_licenses - license.used_licenses) || 0;
    
    const expiresAt = new Date(license.expires_at);
    document.getElementById('currentExpirationDate').textContent = expiresAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Set initial quantity to current total
    const quantityInput = document.getElementById('newLicenseQuantity');
    quantityInput.value = license.total_licenses || 0;

    // Update preview
    updateLicenseChangePreview();

    // Open modal
    const modal = document.getElementById('licenseManagementModal');
    modal.style.display = 'flex';
    
    // Focus quantity input
    quantityInput.focus();
    quantityInput.select();
}

// Close License Management Modal
function closeLicenseManagementModal() {
    const modal = document.getElementById('licenseManagementModal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('licenseManagementForm').reset();
    
    // Hide message
    const messageDiv = document.getElementById('licenseManagementMessage');
    messageDiv.style.display = 'none';
    messageDiv.className = 'message';
    
    // Clear current license
    currentManagedLicense = null;
}

// Calculate and display license change preview
function updateLicenseChangePreview() {
    if (!currentManagedLicense) return;

    const newQuantity = parseInt(document.getElementById('newLicenseQuantity').value) || 0;
    const currentTotal = currentManagedLicense.total_licenses;
    const usedLicenses = currentManagedLicense.used_licenses;
    
    // Calculate change
    const change = newQuantity - currentTotal;
    const isIncrease = change > 0;
    const isDecrease = change < 0;
    const noChange = change === 0;

    // Dates
    const expiresAt = new Date(currentManagedLicense.expires_at);
    const now = new Date();
    const remainingDays = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    
    // Pricing calculations
    const annualPricePerLicense = 200; // €200 per license per year
    const dailyRate = annualPricePerLicense / 365;

    // Get preview container
    const previewDiv = document.getElementById('changePreview');
    const warningDiv = document.getElementById('reductionWarning');
    const warningMessage = document.getElementById('warningMessage');
    const submitBtn = document.getElementById('submitLicenseManagement');

    // Handle changes
    if (isDecrease && newQuantity === 0) {
        previewDiv.style.background = '#fff3cd';
        previewDiv.style.borderLeftColor = '#e67e22';
        previewDiv.innerHTML = `
            <h3 style="margin: 0 0 10px; font-size: 16px; color: #856404;">⚠ Subscription Cancellation</h3>
            <p style="margin: 0 0 8px; color: #856404;">Your subscription will be <strong>canceled</strong> at renewal on <strong>${expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>
            <p style="margin: 0; color: #856404; font-size: 14px;">• All ${currentTotal} license${currentTotal !== 1 ? 's' : ''} will be removed</p>
            <p style="margin: 5px 0 0; color: #856404; font-size: 14px;">• No future charges</p>
            <p style="margin: 5px 0 0; color: #856404; font-size: 14px;">• Data preserved for 90 days after expiration</p>
        `;
        
        if (usedLicenses > 0) {
            warningDiv.style.display = 'block';
            warningMessage.textContent = `You have ${usedLicenses} assigned license${usedLicenses !== 1 ? 's' : ''}. All members will lose access when the subscription expires on ${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`;
        } else {
            warningDiv.style.display = 'none';
        }
        
        submitBtn.disabled = false;
        submitBtn.textContent = 'Schedule Cancellation';
        return;
    }

    // Handle no change
    if (noChange) {
        previewDiv.style.background = '#f8f9fa';
        previewDiv.style.borderLeftColor = '#6c757d';
        previewDiv.innerHTML = `
            <p style="margin: 0; color: #6c757d;">No changes to apply. Adjust the license count or check "Cancel at renewal" to make changes.</p>
        `;
        warningDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Confirm Changes';
        return;
    }

    // Handle license increase (immediate with prorated charge)
    if (isIncrease) {
        const proratedPricePerLicense = Math.ceil(dailyRate * remainingDays * 100) / 100;
        const totalCost = Math.ceil(proratedPricePerLicense * Math.abs(change) * 100) / 100;
        const nextRenewalCost = annualPricePerLicense * newQuantity;

        previewDiv.style.background = '#d4edda';
        previewDiv.style.borderLeftColor = '#28a745';
        previewDiv.innerHTML = `
            <h3 style="margin: 0 0 10px; font-size: 16px; color: #155724;">✓ Adding ${Math.abs(change)} License${Math.abs(change) !== 1 ? 's' : ''}</h3>
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: #155724;">New total:</span>
                    <strong style="color: #155724;">${newQuantity} license${newQuantity !== 1 ? 's' : ''}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: #155724;">Effective:</span>
                    <strong style="color: #155724;">Immediately</strong>
                </div>
            </div>
            <div style="background: white; padding: 10px; border-radius: 4px; margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>Prorated cost (${remainingDays} days):</span>
                    <strong>€${proratedPricePerLicense.toFixed(2)} per license</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 16px;">
                    <span>Charge today:</span>
                    <strong style="color: #007bff;">€${totalCost.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd;">
                    <span style="font-size: 14px;">Next renewal (${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}):</span>
                    <strong style="font-size: 14px;">€${nextRenewalCost.toFixed(2)}/year</strong>
                </div>
            </div>
        `;
        warningDiv.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Licenses Now';
        return;
    }

    // Handle license reduction (scheduled for renewal)
    if (isDecrease) {
        const nextRenewalCost = annualPricePerLicense * newQuantity;
        const annualSavings = annualPricePerLicense * Math.abs(change);
        const belowUsed = newQuantity < usedLicenses;

        previewDiv.style.background = '#fff3cd';
        previewDiv.style.borderLeftColor = '#ffc107';
        previewDiv.innerHTML = `
            <h3 style="margin: 0 0 10px; font-size: 16px; color: #856404;">Reducing ${Math.abs(change)} License${Math.abs(change) !== 1 ? 's' : ''}</h3>
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: #856404;">New total:</span>
                    <strong style="color: #856404;">${newQuantity} license${newQuantity !== 1 ? 's' : ''}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: #856404;">Effective:</span>
                    <strong style="color: #856404;">At renewal (${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</strong>
                </div>
            </div>
            <div style="background: white; padding: 10px; border-radius: 4px; margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>Charge today:</span>
                    <strong>€0.00</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; padding-top: 6px; border-top: 1px solid #ddd;">
                    <span>Next renewal cost:</span>
                    <strong style="color: #007bff;">€${nextRenewalCost.toFixed(2)}/year</strong>
                </div>
                <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px solid #ddd;">
                    <span style="color: #28a745;">Annual savings:</span>
                    <strong style="color: #28a745;">€${annualSavings.toFixed(2)}/year</strong>
                </div>
            </div>
        `;

        // Show warning if reducing below used count
        if (belowUsed) {
            const membersToUnassign = usedLicenses - newQuantity;
            warningDiv.style.display = 'block';
            warningMessage.textContent = `You currently have ${usedLicenses} assigned license${usedLicenses !== 1 ? 's' : ''} but are reducing to ${newQuantity}. You'll need to unassign ${membersToUnassign} member${membersToUnassign !== 1 ? 's' : ''} before ${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, or their access will be automatically revoked.`;
        } else {
            warningDiv.style.display = 'none';
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Schedule Reduction';
        return;
    }
}

// Handle License Management Form Submit
async function handleLicenseManagementSubmit(event) {
    event.preventDefault();
    
    if (!currentManagedLicense) {
        showLicenseManagementMessage('Error: No license selected', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitLicenseManagement');
    const quantityInput = document.getElementById('newLicenseQuantity');
    const newQuantity = parseInt(quantityInput.value);
    const currentTotal = currentManagedLicense.total_licenses;

    // Validation
    if (isNaN(newQuantity) || newQuantity < 0 || newQuantity > 200) {
        showLicenseManagementMessage('Please enter a valid quantity between 0 and 200', 'error');
        return;
    }

    // Check if no change
    if (newQuantity === currentTotal) {
        showLicenseManagementMessage('No changes to apply', 'error');
        return;
    }

    // Check if license has subscription_id for increases
    if (newQuantity > currentTotal && !currentManagedLicense.subscription_id) {
        showLicenseManagementMessage('Error: No active subscription found for this license', 'error');
        return;
    }

    // Confirmation for cancellation
    if (newQuantity === 0) {
        const confirmed = confirm('Are you sure you want to cancel your subscription? All licenses will be removed at renewal.');
        if (!confirmed) return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';

    try {
        const change = newQuantity - currentTotal;
        
        // Handle increase (immediate)
        if (change > 0) {
            if (typeof mepSketcherLicensing !== 'undefined') {
                await mepSketcherLicensing.addLicensesToSubscription(
                    change,
                    currentManagedLicense.organization_id,
                    currentManagedLicense.subscription_id
                );
                // Close modal and reload
                closeLicenseManagementModal();
                await loadLicenses();
            } else {
                throw new Error('Payment system not available');
            }
        }
        // Handle decrease or cancellation (scheduled)
        else if (change < 0) {
            // Call schedule-license-change edge function
            const { data, error } = await authService.supabase.functions.invoke('schedule-license-change', {
                body: {
                    organizationId: currentManagedLicense.organization_id,
                    newQuantity: parseInt(quantityInput.value), 
                    effectiveDate: currentManagedLicense.expires_at
                }
            });

            if (error) throw error;

            // Show success message
            const expiresAt = new Date(currentManagedLicense.expires_at);
            let message;
            if (newQuantity === 0) {
                message = `Subscription cancellation scheduled for ${expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
            } else {
                message = `License reduction to ${newQuantity} scheduled for ${expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
            }
            
            alert(message);
            
            // Close modal and reload
            closeLicenseManagementModal();
            await loadLicenses();
        }
    } catch (error) {
        console.error('Error managing licenses:', error);
        showLicenseManagementMessage(`Error: ${error.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Show message in license management modal
function showLicenseManagementMessage(text, type) {
    const messageDiv = document.getElementById('licenseManagementMessage');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

// ============================================================================
// End License Management Modal Functions
// ============================================================================

// Handle adding a member to organization (LEGACY - replaced by modal)
async function handleAddMember(orgId) {
    const emailInput = document.getElementById('newMemberEmail');
    const roleSelect = document.getElementById('newMemberRole');
    
    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
        alert('Please enter an email address');
        return;
    }

    // Simple query: Find user by email in user_profiles
    const { data: profile, error: profileError } = await authService.supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

    if (profileError || !profile) {
        alert('User not found. Make sure they have registered an account.');
        return;
    }

    // Simple query: Check if already an active member
    const { data: existing } = await authService.supabase
        .from('organization_members')
        .select('user_id, status')
        .eq('organization_id', orgId)
        .eq('user_id', profile.id)
        .eq('status', 'active') // Only check for active members
        .maybeSingle();

    if (existing) {
        alert('This user is already a member of the organization');
        return;
    }

    // Simple insert: Add member
    const { error: insertError } = await authService.supabase
        .from('organization_members')
        .insert({
            organization_id: orgId,
            user_id: profile.id,
            role: role,
            created_at: new Date().toISOString()
        });

    if (insertError) {
        alert(`Error adding member: ${insertError.message}`);
        console.error('Add member error:', insertError);
    } else {
        alert('Member added successfully!');
        emailInput.value = '';
        await loadOrganizationData(); // Reload organization data
    }
}

// Handle removing a member from organization
async function handleRemoveMember(userId, memberName, orgId) {
    const confirmed = confirm(`Are you sure you want to remove ${memberName} from the organization?\n\nThey will lose access and their license will be freed.`);
    if (!confirmed) return;

    if (!membersManager) {
        alert('Error: Member manager not initialized');
        return;
    }

    try {
        await membersManager.removeMember(userId);
        alert(`${memberName} has been removed from the organization`);
        
        // Reload data
        await loadOrganizationData();
        await loadLicenses();
    } catch (error) {
        console.error('Error removing member:', error);
        alert(`Error removing member: ${error.message}`);
    }
}

// Load licenses from Supabase
async function loadLicenses() {
    try {
        const user = authService.getCurrentUser();
        if (!user) return;

        // Simple query: Get user's organizations (as owner)
        const { data: userOrgs, error: orgsError } = await authService.supabase
            .from('organizations')
            .select('id, name')
            .eq('owner_id', user.id);

        if (orgsError) {
            console.error('Error loading organizations:', orgsError);
            return;
        }

        // Check if user is admin (organization owner)
        const isAdmin = userOrgs && userOrgs.length > 0;

        let orgId = null;
        
        if (isAdmin) {
            // Admin view - show full license management
            await loadAdminLicenses(user, userOrgs);
            orgId = userOrgs[0]?.id;
        } else {
            // Member view - show only personal license status
            const memberOrgId = await loadMemberLicenseStatus(user);
            orgId = memberOrgId;
        }
        
        // Initialize license expiration manager if user has an organization
        if (orgId) {
            licenseExpirationManager = new LicenseExpirationManager(authService.supabase, orgId);
            await licenseExpirationManager.initialize();
        } else {
            // No organization - show no license status in Account Overview
            updateAccountOverviewNoLicense();
        }
    } catch (error) {
        console.error('Error in loadLicenses:', error);
    }
}

// Update Account Overview section when user has no license
function updateAccountOverviewNoLicense() {
    const statusElement = document.getElementById('licenseStatus');
    if (statusElement) {
        statusElement.innerHTML = '<span style="color: #6c757d;">No organization or license</span>';
    }
}

// Load full license information for admin users
async function loadAdminLicenses(user, userOrgs) {
    // Simple query: Get organizations where user is an active member
    const { data: memberships, error: membershipsError } = await authService.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active'); // Only load active memberships

    if (membershipsError) {
        console.error('Error loading memberships:', membershipsError);
        return;
    }

    // Combine organization IDs
    const orgIds = [
        ...(userOrgs || []).map(org => org.id),
        ...(memberships || []).map(m => m.organization_id)
    ];

    // Remove duplicates
    const uniqueOrgIds = [...new Set(orgIds)];

    if (uniqueOrgIds.length === 0) {
        // No organizations - show empty state
        return;
    }

    // Simple query: Get licenses for all user's organizations
    const { data: licenses, error: licensesError } = await authService.supabase
        .from('organization_licenses')
        .select('id, organization_id, total_licenses, used_licenses, license_type, expires_at, created_at, subscription_id')
        .in('organization_id', uniqueOrgIds);

    if (licensesError) {
        console.error('Error loading licenses:', licensesError);
        return;
    }

    // Calculate totals (for potential future use)
    const totalLicenses = licenses?.reduce((sum, l) => sum + (l.total_licenses || 0), 0) || 0;
    const usedLicenses = licenses?.reduce((sum, l) => sum + (l.used_licenses || 0), 0) || 0;
    const availableLicenses = totalLicenses - usedLicenses;
    const activeLicenses = licenses?.filter(l => 
        new Date(l.expires_at) > new Date()
    ).length || 0;

    // Display licenses with admin controls
    displayLicenses(licenses, userOrgs, true);
}

// Load personal license status for non-admin members
async function loadMemberLicenseStatus(user) {
    // Get user's active membership with license status
    const { data: membership, error: memberError } = await authService.supabase
        .from('organization_members')
        .select('organization_id, has_license, role')
        .eq('user_id', user.id)
        .eq('status', 'active') // Only load active membership
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors when no rows

    if (memberError) {
        console.error('Error loading member license status:', memberError);
        displayMemberLicenseStatus(null, null);
        return null;
    }

    if (!membership) {
        // No membership found
        displayMemberLicenseStatus(null, null);
        return null;
    }

    // Get organization license details
    const { data: orgLicense, error: licenseError } = await authService.supabase
        .from('organization_licenses')
        .select('license_type, expires_at')
        .eq('organization_id', membership.organization_id)
        .maybeSingle(); // Use maybeSingle to avoid errors

    if (licenseError) {
        console.error('Error loading organization license:', licenseError);
    }

    // Display member license card
    displayMemberLicenseStatus(membership, orgLicense);
    
    // Return organization ID for license expiration manager
    return membership.organization_id;
}

// Display licenses (Admin view)
function displayLicenses(licenses, organizations, isAdmin = true) {
    const container = document.getElementById('licensesContainer');
    
    if (!licenses || licenses.length === 0) {
        // Show buy license interface for first-time users
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3>No Licenses Yet</h3>
                <p>Purchase licenses to start using MepSketcher</p>
                <button class="btn btn-primary" id="buyFirstLicenseBtn">
                    Buy Now
                </button>
            </div>
        `;

        // Add event listener
        const buyBtn = document.getElementById('buyFirstLicenseBtn');
        if (buyBtn) {
            buyBtn.addEventListener('click', handleBuyFirstLicense);
        }
        return;
    }

    // Clear container
    container.innerHTML = '';

    // Create license list
    licenses.forEach(license => {
        // Find the organization name
        const org = organizations?.find(o => o.id === license.organization_id);
        const orgName = org?.name || 'Unknown Organization';
        
        const licenseCard = createLicenseCard(license, orgName, isAdmin);
        container.appendChild(licenseCard);
    });
}

// Display member license status (Non-admin view)
function displayMemberLicenseStatus(membership, orgLicense) {
    const container = document.getElementById('licensesContainer');
    
    if (!membership || !membership.has_license) {
        // No license assigned
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔒</div>
                <h3>No License Assigned</h3>
                <p>You don't currently have a license assigned to your account.</p>
                <p style="margin-top: 1rem; color: #666;">Contact your organization administrator to request a license.</p>
            </div>
        `;
        return;
    }

    const isActive = orgLicense && new Date(orgLicense.expires_at) > new Date();
    const statusClass = isActive ? 'active' : 'expired';
    const statusText = isActive ? 'Active' : 'Expired';
    
    const expiryDate = orgLicense ? new Date(orgLicense.expires_at) : null;
    const formattedExpiry = expiryDate ? expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : 'Unknown';

    container.innerHTML = `
        <div class="license-info member-license">
            <div class="license-card-header">
                <div>
                    <h3 class="license-org-name">Your License</h3>
                    <span class="license-type-badge">${(orgLicense?.license_type || 'standard').toUpperCase()}</span>
                </div>
                <span class="license-status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="license-member-details">
                <div class="license-detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value ${statusClass}">${isActive ? '✓ Licensed' : '⚠ License Expired'}</span>
                </div>
                <div class="license-detail-row">
                    <span class="detail-label">License Type:</span>
                    <span class="detail-value">${orgLicense?.license_type || 'Standard'}</span>
                </div>
                <div class="license-detail-row">
                    <span class="detail-label">Expires:</span>
                    <span class="detail-value">${formattedExpiry}</span>
                </div>
                ${!isActive ? `
                    <div class="license-warning">
                        <p>⚠ Your license has expired. Please contact your administrator to renew.</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Create license card HTML
function createLicenseCard(license, orgName, isAdmin = true) {
    const card = document.createElement('div');
    card.className = 'license-info';

    const isActive = new Date(license.expires_at) > new Date();
    const statusClass = isActive ? 'active' : 'expired';
    const statusText = isActive ? 'Active' : 'Expired';

    const expiryDate = new Date(license.expires_at);
    const formattedExpiry = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const availableLicenses = license.total_licenses - license.used_licenses;

    // Check for scheduled changes
    const hasScheduledChange = license.scheduled_total_licenses !== null && license.scheduled_total_licenses !== undefined;
    const scheduledChangeDate = hasScheduledChange && license.scheduled_change_at 
        ? new Date(license.scheduled_change_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;
    const isIncrease = hasScheduledChange && license.scheduled_total_licenses > license.total_licenses;
    const isDecrease = hasScheduledChange && license.scheduled_total_licenses < license.total_licenses;
    const changeClass = isIncrease ? 'scheduled-increase' : isDecrease ? 'scheduled-decrease' : '';

    card.innerHTML = `
        <div class="license-card-header">
            <div>
                <h3 class="license-org-name">${orgName}</h3>
                <span class="license-type-badge">${(license.license_type || 'starter').toUpperCase()}</span>
                ${hasScheduledChange ? `
                    <span class="scheduled-change-badge ${changeClass}">
                        ${isIncrease ? '↑' : isDecrease ? '↓' : '→'} ${license.scheduled_total_licenses} at renewal
                    </span>
                ` : ''}
            </div>
            <span class="license-status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="license-stats">
            <div class="stat-item">
                <span class="stat-label">Total</span>
                <span class="stat-value">${license.total_licenses || 0}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Used</span>
                <span class="stat-value">${license.used_licenses || 0}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Available</span>
                <span class="stat-value ${availableLicenses > 0 ? 'positive' : 'negative'}">${availableLicenses}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Expires</span>
                <span class="stat-value">${formattedExpiry}</span>
            </div>
        </div>
        ${hasScheduledChange ? `
            <div class="scheduled-change-info">
                <p class="scheduled-change-text">
                    ${isDecrease ? '⚠' : '✓'} Scheduled: ${license.scheduled_total_licenses} license${license.scheduled_total_licenses !== 1 ? 's' : ''} on ${scheduledChangeDate}
                    ${isDecrease && license.scheduled_total_licenses < license.used_licenses ? 
                        `<br><small style="color: #e67e22;">Note: You'll need to unassign ${license.used_licenses - license.scheduled_total_licenses} member${license.used_licenses - license.scheduled_total_licenses !== 1 ? 's' : ''} before renewal.</small>` 
                        : ''}
                </p>
            </div>
        ` : ''}
        ${isAdmin ? `
            <div class="license-actions-section">
                <div class="manage-licenses-section">
                    <button class="btn btn-primary btn-small manage-licenses-btn" 
                            data-license-id="${license.id}">
                        Manage Licenses
                    </button>
                </div>
                <div class="license-actions-buttons">
                    ${!isActive ? '<button class="btn btn-success btn-small renew-btn">Renew License (+1 year)</button>' : ''}
                </div>
            </div>
        ` : ''}
    `;

    // Add event listeners only for admin
    if (isAdmin) {
        const manageBtn = card.querySelector('.manage-licenses-btn');
        if (manageBtn) {
            manageBtn.addEventListener('click', () => {
                openLicenseManagementModal(license);
            });
        }

        const renewBtn = card.querySelector('.renew-btn');
        if (renewBtn) {
            renewBtn.addEventListener('click', () => {
                handleRenewLicense(license);
            });
        }
    }

    return card;
}

// Handle buying first license
async function handleBuyFirstLicense() {
    // Check if Paddle is available
    if (typeof mepSketcherLicensing === 'undefined' || !mepSketcherLicensing) {
        alert('Payment system not available. Please try again later.');
        console.error('mepSketcherLicensing not initialized');
        return;
    }

    // Call purchase function directly - user will specify quantity in Paddle checkout
    mepSketcherLicensing.purchaseYearlyLicense(1);
}

// Handle adding licenses to existing license
async function handleAddLicensesToExisting(license, count) {
    const numberOfLicenses = parseInt(count);

    if (!numberOfLicenses || numberOfLicenses < 1 || numberOfLicenses > 1000) {
        alert('Please enter a valid number of licenses (1-1000)');
        return;
    }

    const { error } = await authService.supabase
        .from('organization_licenses')
        .update({
            total_licenses: license.total_licenses + numberOfLicenses,
            updated_at: new Date().toISOString()
        })
        .eq('id', license.id);

    if (error) {
        alert(`Error: ${error.message}`);
        console.error('Add licenses error:', error);
    } else {
        alert(`Success! ${numberOfLicenses} licenses added`);
        await loadLicenses();
    }
}

// Perform license purchase (shared logic)
async function performLicensePurchase(numberOfLicenses) {
    const user = authService.getCurrentUser();
    if (!user) return;

    // Check if user has any organizations
    const { data: userOrgs } = await authService.supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', user.id)
        .limit(1);

    let orgId;

    if (!userOrgs || userOrgs.length === 0) {
        // Create a default organization for this user
        const orgName = prompt('You need an organization first. Enter organization name:', `${user.email.split('@')[0]}'s Organization`);
        if (!orgName) return;

        const { data: newOrg, error: orgError } = await authService.supabase
            .from('organizations')
            .insert({
                name: orgName,
                owner_id: user.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (orgError) {
            alert(`Error creating organization: ${orgError.message}`);
            console.error('Organization creation error:', orgError);
            return;
        }

        orgId = newOrg.id;

        // Also add user as admin member
        await authService.supabase
            .from('organization_members')
            .insert({
                organization_id: orgId,
                user_id: user.id,
                role: 'admin',
                status: 'active',
                has_license: true, // Assign license to admin
                accepted_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            });

        // Create user profile if it doesn't exist
        await authService.supabase
            .from('user_profiles')
            .upsert({
                user_id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email.split('@')[0],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
    } else {
        orgId = userOrgs[0].id;
    }

    // Create or update organization license
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year from now

    // Check if license already exists
    const { data: existingLicense } = await authService.supabase
        .from('organization_licenses')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();

    let result;

    if (existingLicense) {
        // Update existing license
        result = await authService.supabase
            .from('organization_licenses')
            .update({
                total_licenses: existingLicense.total_licenses + parseInt(numberOfLicenses),
                license_type: 'standard',
                updated_at: new Date().toISOString()
            })
            .eq('id', existingLicense.id);
    } else {
        // Create new license
        result = await authService.supabase
            .from('organization_licenses')
            .insert({
                organization_id: orgId,
                total_licenses: parseInt(numberOfLicenses),
                used_licenses: 0,
                license_type: 'standard',
                expires_at: expiryDate.toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
    }

    if (result.error) {
        alert(`Error: ${result.error.message}`);
        console.error('License creation error:', result.error);
    } else {
        alert(`Success! ${numberOfLicenses} licenses added`);
        // Reload everything
        await loadOrganizationData();
        await loadLicenses();
    }
}

// Handle renew license
async function handleRenewLicense(license) {
    const confirmed = confirm(`Renew license?\n\nThis will extend the expiry date by 1 year from today.`);
    if (!confirmed) return;

    const newExpiryDate = new Date();
    newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);

    const { error } = await authService.supabase
        .from('organization_licenses')
        .update({
            expires_at: newExpiryDate.toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', license.id);

    if (error) {
        alert(`Error: ${error.message}`);
        console.error('Renew license error:', error);
    } else {
        alert('License renewed successfully! Expiry extended by 1 year.');
        await loadLicenses();
    }
}

// Handle buying more licenses via Paddle
function handleBuyMoreLicenses(license) {
    // Check if Paddle is available
    if (typeof mepSketcherLicensing === 'undefined' || !mepSketcherLicensing) {
        alert('Payment system not available. Please try again later.');
        console.error('mepSketcherLicensing not initialized');
        return;
    }

    // Open the purchase licenses modal with pricing preview
    openPurchaseLicensesModal(license);
}

// Handle extend license
async function handleExtendLicense(license) {
    const months = prompt('How many months would you like to extend?', '6');
    if (!months || isNaN(months) || months < 1) {
        alert('Please enter a valid number of months');
        return;
    }

    const currentExpiry = new Date(license.expires_at);
    const newExpiryDate = new Date(currentExpiry);
    newExpiryDate.setMonth(newExpiryDate.getMonth() + parseInt(months));

    const { error } = await authService.supabase
        .from('organization_licenses')
        .update({
            expires_at: newExpiryDate.toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', license.id);

    if (error) {
        alert(`Error: ${error.message}`);
        console.error('Extend license error:', error);
    } else {
        alert(`License extended by ${months} months!`);
        await loadLicenses();
    }
}
