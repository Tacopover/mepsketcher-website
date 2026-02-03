// Login Page JavaScript
// Handles login, signup, and password reset forms

document.addEventListener('DOMContentLoaded', () => {
    // Get form elements
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    
    const loginMessage = document.getElementById('loginMessage');
    const signupMessage = document.getElementById('signupMessage');
    const resetMessage = document.getElementById('resetMessage');

    // Verify all required elements exist
    if (!loginForm || !signupForm || !resetPasswordForm) {
        console.error('Missing form elements:', { loginForm, signupForm, resetPasswordForm });
        return;
    }

    // Check for invitation token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const invitationToken = urlParams.get('invitation_token');
    const invitedEmail = urlParams.get('email');
    const invitedOrganization = urlParams.get('organization');
    const actionParam = urlParams.get('action'); // Check for action=trial

    // Get tab buttons
    const tabButtons = document.querySelectorAll('.auth-tab');
    
    // Get forgot password link
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const backToLoginBtn = document.getElementById('backToLogin');

    // Handle trial signup (action=trial in URL)
    if (actionParam === 'trial') {
        // Switch to signup tab
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabButtons[1].classList.add('active'); // Signup is second tab
        
        loginForm.classList.remove('active');
        resetPasswordForm.classList.remove('active');
        signupForm.classList.add('active');

        // Show trial message
        showMessage(signupMessage, '🎉 Start your 14-day free trial! No credit card required.', 'info');
    }

    // If invitation token exists, switch to signup tab and pre-fill email & organization
    if (invitationToken && invitedEmail && invitedOrganization) {
        // Switch to signup tab
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabButtons[1].classList.add('active'); // Assuming signup is second tab
        
        loginForm.classList.remove('active');
        resetPasswordForm.classList.remove('active');
        signupForm.classList.add('active');

        // Pre-fill email and make read-only
        const emailInput = document.getElementById('signupEmail');
        if (emailInput) {
            emailInput.value = invitedEmail;
            emailInput.readOnly = true;
            emailInput.style.backgroundColor = '#f5f5f5';
            emailInput.style.cursor = 'not-allowed';
        } else {
            console.error('signupEmail input element not found');
        }

        // Show invitation message (organization name no longer needs to be shown since we auto-generate it)
        if (signupMessage) {
            showMessage(signupMessage, `✉️ You've been invited to join ${invitedOrganization}! Complete signup below.`, 'info');
        }
    }

    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Update active tab
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show corresponding form
            loginForm.classList.remove('active');
            signupForm.classList.remove('active');
            
            if (targetTab === 'login') {
                loginForm.classList.add('active');
            } else if (targetTab === 'signup') {
                signupForm.classList.add('active');
            }
            
            // Clear messages
            clearMessages();
        });
    });

    // Forgot password link
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Hide login form, show reset form
            loginForm.classList.remove('active');
            resetPasswordForm.classList.remove('hidden');
            resetPasswordForm.classList.add('active');
            
            // Deactivate tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            clearMessages();
        });
    }

    // Back to login button
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', () => {
            resetPasswordForm.classList.remove('active');
            resetPasswordForm.classList.add('hidden');
            loginForm.classList.add('active');
            
            // Reactivate login tab
            tabButtons[0].classList.add('active');
            
            clearMessages();
        });
    }

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        showMessage(loginMessage, 'Signing in...', 'info');
        
        const result = await authService.signIn(email, password);
        
        if (result.success) {
            showMessage(loginMessage, 'Sign in successful! Redirecting...', 'success');
            
            // Always redirect to dashboard after login
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        } else {
            showMessage(loginMessage, `Error: ${result.error}`, 'error');
        }
    });

    // Signup form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
        const agreeTerms = document.getElementById('agreeTerms').checked;
        
        // Validation
        if (password !== passwordConfirm) {
            showMessage(signupMessage, 'Passwords do not match', 'error');
            return;
        }
        
        if (password.length < 8) {
            showMessage(signupMessage, 'Password must be at least 8 characters', 'error');
            return;
        }
        
        if (!agreeTerms) {
            showMessage(signupMessage, 'You must agree to the Terms of Service', 'error');
            return;
        }
        
        // If this is a trial signup, show appropriate message
        const isTrial = actionParam === 'trial';
        showMessage(signupMessage, isTrial ? 'Creating your trial account...' : 'Creating account...', 'info');
        
        // Pass null for organizationName (will be auto-generated from user's name)
        // Pass invitation token if present
        const result = await authService.signUp(email, password, name, null, invitationToken);
        
        if (result.success) {
            if (invitationToken) {
                // Invitation-based signup - no email verification needed
                showMessage(signupMessage, '✅ Account created! You can now sign in.', 'success');
            } else if (isTrial) {
                showMessage(signupMessage, '🎉 Trial account created! Please check your email to verify your account and start your 14-day free trial. The email may take a few minutes to arrive.', 'success');
            } else {
                showMessage(signupMessage, 'Account created successfully! Please check your email to verify your account. The email may take a few minutes to arrive.', 'success');
            }
            
            // Clear form
            signupForm.reset();
            
            // Switch to login tab after 3 seconds (or 1 second for invitation signups)
            setTimeout(() => {
                tabButtons[0].click();
            }, invitationToken ? 1000 : 3000);
        } else {
            showMessage(signupMessage, `Error: ${result.error}`, 'error');
        }
    });

    // Reset password form submission
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('resetEmail').value.trim();
        
        // Validate email
        if (!email) {
            showMessage(resetMessage, 'Please enter your email address.', 'error');
            return;
        }
        
        const submitBtn = resetPasswordForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        
        try {
            // Call the Edge Function to request password reset
            const response = await fetch('https://jskwfvwbhyltmxcdsbnm.supabase.co/functions/v1/reset-password-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to request password reset');
            }

            showMessage(resetMessage, 'Password reset link sent! Please check your email.', 'success');
            resetPasswordForm.reset();
            
            // Keep form visible for user to return to login
            setTimeout(() => {
                backToLoginBtn.click();
            }, 3000);
        } catch (error) {
            console.error('Password reset error:', error);
            showMessage(resetMessage, error.message || 'Failed to send password reset link. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });

    // Helper function to show messages
    function showMessage(element, message, type) {
        element.textContent = message;
        element.className = `auth-message ${type}`;
    }

    // Helper function to clear all messages
    function clearMessages() {
        loginMessage.className = 'auth-message';
        signupMessage.className = 'auth-message';
        resetMessage.className = 'auth-message';
    }

    // Check if user is already logged in
    checkAuthStatus();
});

// Check authentication status
async function checkAuthStatus() {
    // Wait for auth service to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (authService.isAuthenticated()) {
        console.log('User already logged in, redirecting to dashboard...');
        window.location.href = 'dashboard.html';
    }
}
