// MepSketcher Authentication Module
// Handles user authentication using Supabase

class AuthService {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.initialized = false;
    }

    // Initialize Supabase client
    async initialize() {
        if (this.initialized) return;

        try {
            // Create Supabase client
            this.supabase = supabase.createClient(
                SUPABASE_CONFIG.url,
                SUPABASE_CONFIG.anonKey,
                {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: true
                    }
                }
            );

            // Make supabase client globally accessible for other modules (like paddle.js)
            window.supabase = this.supabase;

            // Check for existing session
            const { data: { session } } = await this.supabase.auth.getSession();
            
            if (session) {
                this.currentUser = session.user;
                console.log('Session restored for user:', this.currentUser.email);
            }

            // Listen for auth state changes
            this.supabase.auth.onAuthStateChange((event, session) => {
                console.log('Auth state changed:', event);
                this.currentUser = session?.user || null;
                this.handleAuthStateChange(event, session);
            });

            this.initialized = true;
            
            // Emit 'authReady' event - like raising an event in C#
            console.log('About to dispatch authReady event');
            document.dispatchEvent(new CustomEvent('authReady', {
                detail: { authenticated: this.isAuthenticated() }
            }));
            console.log('authReady event dispatched');
        } catch (error) {
            console.error('Failed to initialize auth service:', error);
            throw error;
        }
    }

    // Handle authentication state changes
    handleAuthStateChange(event, session) {
        switch (event) {
            case 'SIGNED_IN':
                console.log('User signed in:', session.user.email);
                // Emit custom event for UI updates
                document.dispatchEvent(new CustomEvent('authStateChanged', { 
                    detail: { event: 'SIGNED_IN', user: session.user }
                }));
                // Redirect to dashboard
                if (window.location.pathname.includes('login.html')) {
                    window.location.href = 'dashboard.html';
                }
                break;
            case 'SIGNED_OUT':
                console.log('User signed out');
                // Emit custom event for UI updates
                document.dispatchEvent(new CustomEvent('authStateChanged', { 
                    detail: { event: 'SIGNED_OUT', user: null }
                }));
                // Redirect to home
                if (window.location.pathname.includes('dashboard.html')) {
                    window.location.href = 'index.html';
                }
                break;
            case 'TOKEN_REFRESHED':
                console.log('Token refreshed');
                break;
        }
    }

        // Sign up new user and create organization using Edge Function
    async signUp(email, password, name, organizationName, invitationToken = null) {
        try {
            console.log(`Signing up user: ${email} with organization: ${organizationName || 'default'}`);
            
            const requestBody = {
                email,
                password,
                name,
                organizationName
            };

            // Add invitation token if provided
            if (invitationToken) {
                requestBody.invitationToken = invitationToken;
                console.log('Signing up with invitation token');
            }
            
            const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/signup`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
              },
              body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            
            if (!response.ok || !data.success) {
              console.error('Signup failed:', data.error);
              throw new Error(data.error || 'Signup failed');
            }

            console.log('Signup successful:', data.user.id);

            // All signups require email confirmation
            console.log('Email confirmation required. Check your email.');
            return {
              success: true,
              requiresEmailConfirmation: true,
              message: data.message || 'Please check your email to confirm your account before signing in.',
              user: data.user
            };
        } catch (error) {
            console.error('Signup error:', error);
            throw error;
        }
    }

    // Sign in existing user
    async signIn(email, password) {
        try {
            console.log('Signing in user:', email);

            // Call the signin Edge Function
            const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/signin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_CONFIG.anonKey,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const result = await response.json();

            if (!result.success) {
                console.error('Signin failed:', result.error);
                return {
                    success: false,
                    error: result.error
                };
            }

            console.log('Signin successful:', result.user.id);
            
            if (result.pendingOrganizationsProcessed) {
                console.log('Pending organizations were processed');
            }

            // Now sign in with Supabase client to establish session
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                console.error('Session establishment error:', error);
                throw error;
            }

            this.currentUser = data.user;

            return {
                success: true,
                user: data.user,
                session: data.session,
                pendingOrganizationsProcessed: result.pendingOrganizationsProcessed
            };
        } catch (error) {
            console.error('Sign in error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Sign out user
    async signOut() {
        try {
            console.log('Attempting to sign out user...');
            
            if (!this.supabase) {
                throw new Error('Supabase client not initialized');
            }
            
            // Try to sign out with Supabase
            const { error } = await this.supabase.auth.signOut();
            
            // If there's an AuthSessionMissingError, we can still clear local state
            if (error && error.name === 'AuthSessionMissingError') {
                console.log('Session already missing, clearing local state...');
                this.currentUser = null;
                
                // Clear all Supabase session data
                this.clearAllSupabaseData();
                
                // Emit sign out event
                document.dispatchEvent(new CustomEvent('authStateChanged', { 
                    detail: { event: 'SIGNED_OUT', user: null }
                }));
                
                console.log('Local logout successful');
                return { success: true };
            }
            
            if (error) throw error;

            this.currentUser = null;
            
            // Clear all session data to prevent auto-login
            this.clearAllSupabaseData();
            
            // Verify session is truly gone
            const { data: sessionCheck } = await this.supabase.auth.getSession();
            if (sessionCheck?.session) {
                console.warn('Session still present after signOut, forcing complete clear...');
                // Nuclear option - clear everything
                localStorage.clear();
                sessionStorage.clear();
                this.recreateSupabaseClient();
            }
            
            console.log('User signed out successfully - session verified clear');
            
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            
            // If any other error occurs, try to force clear the local state
            console.log('Attempting force logout...');
            this.currentUser = null;
            
            // Clear local storage
            try {
                this.clearAllSupabaseData();
                
                // Emit sign out event
                document.dispatchEvent(new CustomEvent('authStateChanged', { 
                    detail: { event: 'SIGNED_OUT', user: null }
                }));
                
                console.log('Force logout completed');
                return { success: true, forced: true };
            } catch (clearError) {
                console.error('Failed to clear local storage:', clearError);
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Get user session
    async getSession() {
        try {
            const { data: { session }, error } = await this.supabase.auth.getSession();
            if (error) throw error;
            return session;
        } catch (error) {
            console.error('Get session error:', error);
            return null;
        }
    }

    // Reset password
    async resetPassword(email) {
        try {
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });

            if (error) throw error;

            return {
                success: true,
                message: 'Password reset email sent! Please check your inbox.'
            };
        } catch (error) {
            console.error('Reset password error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update password (called from reset-password.html)
    async updatePassword(newPassword) {
        try {
            const { data, error } = await this.supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            return {
                success: true,
                message: 'Password updated successfully!'
            };
        } catch (error) {
            console.error('Update password error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Clear all Supabase authentication data
    clearAllSupabaseData() {
        console.log('Clearing all Supabase authentication data...');
        
        // Get the Supabase URL to generate the correct storage key
        const supabaseUrl = SUPABASE_CONFIG?.url || '';
        let storageKey = 'supabase.auth.token';
        
        if (supabaseUrl) {
            try {
                const url = new URL(supabaseUrl);
                const hostname = url.hostname;
                storageKey = `sb-${hostname}-auth-token`;
                console.log('Generated storage key:', storageKey);
            } catch (e) {
                console.log('Could not parse Supabase URL, using default keys');
            }
        }
        
        // List of possible Supabase localStorage keys
        const supabaseKeys = [
            storageKey,
            'supabase.auth.token',
            'supabase-auth-token',
            'sb-localhost-auth-token',
            'sb-auth-token'
        ];
        
        // Remove known keys from both localStorage and sessionStorage
        supabaseKeys.forEach(key => {
            if (localStorage.getItem(key)) {
                console.log('Removing localStorage key:', key);
                localStorage.removeItem(key);
            }
            if (sessionStorage.getItem(key)) {
                console.log('Removing sessionStorage key:', key);
                sessionStorage.removeItem(key);
            }
        });
        
        // Find and remove any remaining keys that contain 'supabase' or 'sb-'
        const allLocalKeys = Object.keys(localStorage);
        const allSessionKeys = Object.keys(sessionStorage);
        
        [...allLocalKeys, ...allSessionKeys].forEach(key => {
            if (key && (key.includes('supabase') || key.startsWith('sb-'))) {
                console.log('Removing additional key:', key);
                localStorage.removeItem(key);
                sessionStorage.removeItem(key);
            }
        });
        
        console.log('All Supabase authentication data cleared');
        
        // Recreate Supabase client to ensure clean state
        this.recreateSupabaseClient();
    }
    
    // Recreate Supabase client after logout
    recreateSupabaseClient() {
        try {
            console.log('Recreating Supabase client...');
            this.supabase = supabase.createClient(
                SUPABASE_CONFIG.url,
                SUPABASE_CONFIG.anonKey,
                {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: true
                    }
                }
            );
            
            // Update global reference
            window.supabase = this.supabase;
            
            // Re-setup auth state listener
            this.supabase.auth.onAuthStateChange((event, session) => {
                console.log('Auth state changed after recreation:', event);
                this.currentUser = session?.user || null;
                this.handleAuthStateChange(event, session);
            });
            
            console.log('Supabase client recreated successfully');
        } catch (error) {
            console.error('Failed to recreate Supabase client:', error);
        }
    }

    // Update user profile
    async updateProfile(updates) {
        try {
            const { data, error } = await this.supabase.auth.updateUser({
                data: updates
            });

            if (error) throw error;

            return {
                success: true,
                user: data.user
            };
        } catch (error) {
            console.error('Update profile error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create global auth service instance
const authService = new AuthService();

// Debug function for authentication troubleshooting
function debugAuthStatus() {
    console.log('=== Auth Debug Info ===');
    console.log('Auth service exists:', typeof authService !== 'undefined');
    console.log('Auth service initialized:', authService?.initialized || false);
    console.log('Current user:', authService?.currentUser?.email || 'None');
    console.log('Is authenticated:', authService?.isAuthenticated() || false);
    console.log('Supabase client exists:', typeof authService?.supabase !== 'undefined');
    
    if (typeof authService?.supabase !== 'undefined') {
        console.log('Supabase URL configured:', !!authService.supabase.supabaseUrl);
    }
    
    // Check localStorage for auth tokens
    console.log('--- LocalStorage Auth Keys ---');
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('supabase')) {
            console.log(`${key}: ${localStorage.getItem(key)?.substring(0, 50)}...`);
        }
    }
}

// Force logout function for emergencies
async function forceLogout() {
    console.log('=== Force Logout ===');
    
    if (typeof authService !== 'undefined') {
        authService.currentUser = null;
        authService.clearAllSupabaseData();
    }
    
    // Emit sign out event
    document.dispatchEvent(new CustomEvent('authStateChanged', { 
        detail: { event: 'SIGNED_OUT', user: null }
    }));
    
    console.log('Force logout completed - refresh page to see changes');
    
    // Redirect to home
    if (window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'index.html';
    }
}

// Debug function to inspect localStorage keys in detail
function inspectLocalStorage() {
    console.log('=== LOCALSTORAGE INSPECTION ===');
    const allKeys = Object.keys(localStorage);
    console.log(`Total keys: ${allKeys.length}`);
    
    allKeys.forEach(key => {
        const value = localStorage.getItem(key);
        console.log(`Key: "${key}"`);
        console.log(`  Length: ${value?.length || 0}`);
        console.log(`  Value preview: ${value?.substring(0, 100)}${value?.length > 100 ? '...' : ''}`);
        
        if (key.includes('supabase') || key.includes('sb-')) {
            console.log(`  ⚠️  SUPABASE-RELATED KEY FOUND`);
        }
    });
    console.log('=== END INSPECTION ===');
}

// Make debug functions available globally (only in development)
if (window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.includes('github.io')) {
    window.debugAuthStatus = debugAuthStatus;
    window.forceLogout = forceLogout;
    window.inspectLocalStorage = inspectLocalStorage;
    console.log('🔧 Debug functions enabled (development mode)');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await authService.initialize();
        console.log('Auth service initialized');
    } catch (error) {
        console.error('Failed to initialize auth service:', error);
    }
});
