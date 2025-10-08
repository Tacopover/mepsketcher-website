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
                // Redirect to dashboard
                if (window.location.pathname.includes('login.html')) {
                    window.location.href = 'dashboard.html';
                }
                break;
            case 'SIGNED_OUT':
                console.log('User signed out');
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

    // Sign up new user
    async signUp(email, password, name) {
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        name: name
                    }
                }
            });

            if (error) throw error;

            return {
                success: true,
                user: data.user,
                message: 'Account created! Please check your email to verify your account.'
            };
        } catch (error) {
            console.error('Sign up error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Sign in existing user
    async signIn(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            this.currentUser = data.user;

            return {
                success: true,
                user: data.user,
                session: data.session
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
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;

            this.currentUser = null;
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return {
                success: false,
                error: error.message
            };
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await authService.initialize();
        console.log('Auth service initialized');
    } catch (error) {
        console.error('Failed to initialize auth service:', error);
    }
});
