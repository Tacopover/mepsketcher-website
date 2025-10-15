// Dashboard JavaScript
// Handles dashboard functionality, license management, and organization management

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

        // Get organizations where user is a member
        const { data: memberships, error: membershipsError } = await authService.supabase
            .from('organization_members')
            .select(`
                organization_id,
                role,
                organizations (
                    id,
                    name,
                    owner_id,
                    created_at
                )
            `)
            .eq('user_id', user.id);

        if (membershipsError) {
            console.error('Error loading memberships:', membershipsError);
        }

        // Combine organizations
        const allOrgs = [
            ...(ownedOrgs || []).map(org => ({ 
                ...org, 
                role: 'admin', 
                isOwner: true 
            })),
            ...(memberships || [])
                .filter(m => m.organizations)
                .map(m => ({ 
                    ...m.organizations, 
                    role: m.role, 
                    isOwner: false 
                }))
        ];

        // Remove duplicates
        const uniqueOrgs = Array.from(
            new Map(allOrgs.map(org => [org.id, org])).values()
        );

        if (uniqueOrgs.length > 0) {
            displayOrganizationInfo(uniqueOrgs[0]); // Show first organization
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
    if (isAdmin) {
        // Load organization members
        const { data: members, error } = await authService.supabase
            .from('organization_members')
            .select(`
                user_id,
                role,
                created_at,
                user_profiles (
                    name,
                    email
                )
            `)
            .eq('organization_id', org.id);

        if (!error && members) {
            membersHtml = `
                <div class="org-members-section">
                    <div class="add-member-section">
                        <h4>Add New Member</h4>
                        <div class="form-inline">
                            <input type="email" 
                                   id="newMemberEmail" 
                                   placeholder="Enter member email" 
                                   class="form-input">
                            <select id="newMemberRole" class="form-input">
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                            </select>
                            <button class="btn btn-primary btn-small" id="addMemberBtn" data-org-id="${org.id}">
                                Add Member
                            </button>
                        </div>
                    </div>
                    <h3>Organization Members (${members.length})</h3>
                    <div class="org-members-list">
                        ${members.map(member => `
                            <div class="org-member-item">
                                <div class="member-info">
                                    <span class="member-name">${member.user_profiles?.name || member.user_profiles?.email || 'Unknown'}</span>
                                    <span class="member-role ${member.role}">${member.role}</span>
                                </div>
                                ${member.user_id !== user.id ? `
                                    <button class="btn btn-danger btn-small remove-member-btn" 
                                            data-user-id="${member.user_id}" 
                                            data-org-id="${org.id}">
                                        Remove
                                    </button>
                                ` : ''}
                            </div>
                        `).join('')}
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
        </div>
        ${membersHtml}
    `;

    container.appendChild(orgDiv);

    // Add event listeners for member management
    if (isAdmin) {
        // Remove member buttons
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                handleRemoveMember(btn.dataset.userId, btn.dataset.orgId);
            });
        });

        // Add member button
        const addMemberBtn = document.getElementById('addMemberBtn');
        if (addMemberBtn) {
            addMemberBtn.addEventListener('click', () => {
                handleAddMember(addMemberBtn.dataset.orgId);
            });
        }
    }
}

// Handle adding a member to organization
async function handleAddMember(orgId) {
    const emailInput = document.getElementById('newMemberEmail');
    const roleSelect = document.getElementById('newMemberRole');
    
    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
        alert('Please enter an email address');
        return;
    }

    // Find user by email in user_profiles
    const { data: profiles, error: profileError } = await authService.supabase
        .from('user_profiles')
        .select('user_id, email')
        .eq('email', email)
        .single();

    if (profileError || !profiles) {
        alert('User not found. Make sure they have registered an account.');
        return;
    }

    // Check if already a member
    const { data: existing } = await authService.supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', orgId)
        .eq('user_id', profiles.user_id)
        .single();

    if (existing) {
        alert('This user is already a member of the organization');
        return;
    }

    // Add member
    const { error: insertError } = await authService.supabase
        .from('organization_members')
        .insert({
            organization_id: orgId,
            user_id: profiles.user_id,
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
async function handleRemoveMember(userId, orgId) {
    const confirmed = confirm('Are you sure you want to remove this member?');
    if (!confirmed) return;

    const { error } = await authService.supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', orgId)
        .eq('user_id', userId);

    if (error) {
        alert(`Error removing member: ${error.message}`);
        console.error('Remove member error:', error);
    } else {
        alert('Member removed successfully!');
        await loadOrganizationData(); // Reload organization data
    }
}

// Load licenses from Supabase
async function loadLicenses() {
    try {
        const user = authService.getCurrentUser();
        if (!user) return;

        // Get user's organizations
        const { data: userOrgs, error: orgsError } = await authService.supabase
            .from('organizations')
            .select('*')
            .eq('owner_id', user.id);

        if (orgsError) {
            console.error('Error loading organizations:', orgsError);
        }

        // Also get organizations where user is a member
        const { data: memberships, error: membershipsError } = await authService.supabase
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user.id);

        if (membershipsError) {
            console.error('Error loading memberships:', membershipsError);
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
            document.getElementById('activeLicenses').textContent = '0';
            document.getElementById('totalLicenses').textContent = '0';
            document.getElementById('availableLicenses').textContent = '0';
            return;
        }

        // Get licenses for all user's organizations
        const { data: licenses, error: licensesError } = await authService.supabase
            .from('organization_licenses')
            .select('*')
            .in('organization_id', uniqueOrgIds);

        if (licensesError) {
            console.error('Error loading licenses:', licensesError);
            return;
        }

        // Calculate totals
        const totalLicenses = licenses?.reduce((sum, l) => sum + (l.total_licenses || 0), 0) || 0;
        const usedLicenses = licenses?.reduce((sum, l) => sum + (l.used_licenses || 0), 0) || 0;
        const availableLicenses = totalLicenses - usedLicenses;
        const activeLicenses = licenses?.filter(l => 
            new Date(l.expires_at) > new Date()
        ).length || 0;
        
        document.getElementById('activeLicenses').textContent = activeLicenses;
        document.getElementById('totalLicenses').textContent = totalLicenses;
        document.getElementById('availableLicenses').textContent = availableLicenses;

        // Display licenses
        displayLicenses(licenses, userOrgs);
    } catch (error) {
        console.error('Error in loadLicenses:', error);
    }
}

// Display licenses
function displayLicenses(licenses, organizations) {
    const container = document.getElementById('licensesContainer');
    
    if (!licenses || licenses.length === 0) {
        // Show buy license interface for first-time users
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3>No Licenses Yet</h3>
                <p>Purchase licenses to start using MepSketcher</p>
                <div class="license-purchase-form">
                    <h4>Buy Licenses</h4>
                    <div class="form-group">
                        <label for="buyLicenseCount">Number of Licenses (1-1000)</label>
                        <input type="number" 
                               id="buyLicenseCount" 
                               class="form-input" 
                               min="1" 
                               max="1000" 
                               value="5" 
                               placeholder="Enter number of licenses">
                    </div>
                    <div class="form-group">
                        <label for="buyLicenseType">License Type</label>
                        <select id="buyLicenseType" class="form-input">
                            <option value="starter">Starter</option>
                            <option value="professional" selected>Professional</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" id="buyFirstLicenseBtn">
                        Buy Licenses
                    </button>
                </div>
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
        
        const licenseCard = createLicenseCard(license, orgName);
        container.appendChild(licenseCard);
    });
}

// Create license card HTML
function createLicenseCard(license, orgName) {
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

    card.innerHTML = `
        <div class="license-card-header">
            <div>
                <h3 class="license-org-name">${orgName}</h3>
                <span class="license-type-badge">${(license.license_type || 'starter').toUpperCase()}</span>
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
        <div class="license-actions-section">
            <div class="purchase-licenses-section">
                <p class="purchase-text">Purchase additional licenses</p>
                <button class="btn btn-primary btn-small buy-licenses-btn" 
                        data-license-id="${license.id}">
                    Buy Now
                </button>
            </div>
            <div class="license-actions-buttons">
                ${!isActive ? '<button class="btn btn-success btn-small renew-btn">Renew License (+1 year)</button>' : ''}
            </div>
        </div>
    `;

    // Add event listeners
    const buyBtn = card.querySelector('.buy-licenses-btn');
    if (buyBtn) {
        buyBtn.addEventListener('click', () => {
            handleBuyMoreLicenses(license);
        });
    }

    const renewBtn = card.querySelector('.renew-btn');
    if (renewBtn) {
        renewBtn.addEventListener('click', () => {
            handleRenewLicense(license);
        });
    }

    return card;
}

// Handle buying first license
async function handleBuyFirstLicense() {
    const countInput = document.getElementById('buyLicenseCount');
    const typeSelect = document.getElementById('buyLicenseType');

    const count = parseInt(countInput.value);
    const type = typeSelect.value;

    if (!count || count < 1 || count > 1000) {
        alert('Please enter a valid number of licenses (1-1000)');
        return;
    }

    await performLicensePurchase(count, type);
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
async function performLicensePurchase(numberOfLicenses, licenseType) {
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
        .single();

    let result;

    if (existingLicense) {
        // Update existing license
        result = await authService.supabase
            .from('organization_licenses')
            .update({
                total_licenses: existingLicense.total_licenses + parseInt(numberOfLicenses),
                license_type: licenseType,
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
                license_type: licenseType,
                expires_at: expiryDate.toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
    }

    if (result.error) {
        alert(`Error: ${result.error.message}`);
        console.error('License creation error:', result.error);
    } else {
        alert(`Success! ${numberOfLicenses} ${licenseType} licenses added`);
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

    // Open Paddle checkout for purchasing additional licenses
    // The quantity will be specified in the Paddle checkout
    mepSketcherLicensing.purchaseYearlyLicense();
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
