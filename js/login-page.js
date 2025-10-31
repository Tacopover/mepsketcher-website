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

    // Check for invitation token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const invitationToken = urlParams.get('invitation_token');
    const invitedEmail = urlParams.get('email');
    const invitedOrganization = urlParams.get('organization');

    // Get tab buttons
    const tabButtons = document.querySelectorAll('.auth-tab');
    
    // Get forgot password link
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const backToLoginBtn = document.getElementById('backToLogin');

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
        emailInput.value = invitedEmail;
        emailInput.readOnly = true;
        emailInput.style.backgroundColor = '#f5f5f5';
        emailInput.style.cursor = 'not-allowed';

        // Pre-fill organization name and make read-only
        const orgInput = document.getElementById('organizationName');
        orgInput.value = invitedOrganization;
        orgInput.readOnly = true;
        orgInput.style.backgroundColor = '#f5f5f5';
        orgInput.style.cursor = 'not-allowed';

        // Update the organization hint text
        const orgHint = orgInput.nextElementSibling;
        if (orgHint && orgHint.classList.contains('form-hint')) {
            orgHint.textContent = 'You are joining an existing organization';
            orgHint.style.color = '#0066cc';
        }

        // Show invitation message
        showMessage(signupMessage, '✉️ You\'ve been invited to join an organization! Complete signup below.', 'info');
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
        const organizationName = document.getElementById('organizationName').value;
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
        
        showMessage(signupMessage, 'Creating account...', 'info');
        
        // Pass invitation token if present
        const result = await authService.signUp(email, password, name, organizationName, invitationToken);
        
        if (result.success) {
            showMessage(signupMessage, 'Account created successfully! Please check your email to verify your account.', 'success');
            
            // Clear form
            signupForm.reset();
            
            // Switch to login tab after 3 seconds
            setTimeout(() => {
                tabButtons[0].click();
            }, 3000);
        } else {
            showMessage(signupMessage, `Error: ${result.error}`, 'error');
        }
    });

    // Reset password form submission
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('resetEmail').value;
        
        showMessage(resetMessage, 'Sending reset link...', 'info');
        
        const result = await authService.resetPassword(email);
        
        if (result.success) {
            showMessage(resetMessage, result.message, 'success');
            resetPasswordForm.reset();
        } else {
            showMessage(resetMessage, `Error: ${result.error}`, 'error');
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
