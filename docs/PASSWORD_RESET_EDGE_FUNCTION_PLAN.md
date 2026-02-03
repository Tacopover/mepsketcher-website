# Password Reset Edge Function Implementation Plan

## Overview

Currently, the password reset functionality relies on Supabase's built-in email service, which has limitations:

- Token expiration issues
- Limited email customization
- Unreliable default email delivery
- No control over email content

This plan outlines creating a custom Edge Function to handle password resets with:

- **Custom email templates** (HTML/CSS, branded)
- **Reliable delivery** via Resend SMTP
- **Custom reset tokens** (instead of Supabase OTP)
- **Full control** over the password reset flow

---

## Architecture Overview

```
┌─────────────────┐
│   Login Page    │
│  (forgot pwd)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  POST /reset-password-request            │
│  (Edge Function)                        │
│  - Validate email exists                │
│  - Generate reset token                 │
│  - Store token in DB (temp table)       │
│  - Send custom email via Resend         │
│  - Return success                       │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  User receives email                     │
│  Link: /reset-password.html?token=...   │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Reset Password Page                     │
│  - Extract token from URL                │
│  - User enters new password              │
│  - Validates token & password            │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  POST /confirm-password-reset            │
│  (Edge Function)                        │
│  - Validate token (check DB)            │
│  - Check token not expired               │
│  - Update user password in Supabase     │
│  - Delete token from DB                 │
│  - Return success                       │
└─────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Database Setup

**Create temporary reset token table:**

```sql
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

-- Index for fast lookups
CREATE INDEX idx_reset_token ON password_reset_tokens(token);
CREATE INDEX idx_reset_email ON password_reset_tokens(email);

-- Enable RLS (optional, for security)
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Only the service role can manage these
CREATE POLICY "Service role manages reset tokens"
    ON password_reset_tokens
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
```

### Phase 2: Edge Function - Request Password Reset

**Location:** `supabase/functions/reset-password-request/index.ts`

**Functionality:**

- Accept POST request with email
- Check if user exists in Supabase Auth
- Generate secure random token (32 characters)
- Store token in `password_reset_tokens` table (expires in 24 hours)
- Send email via Resend with custom HTML template
- Return success/error message

**Key Requirements:**

- RESEND_API_KEY environment variable must be set
- SITE_URL environment variable for reset link
- Email template with:
  - MepSketcher branding
  - Reset link with token
  - Token expiration info (24 hours)
  - "Didn't request this?" security message
  - "If link doesn't work" alternative instructions

**Error Handling:**

- Email not found → Don't reveal if user exists (security)
- Email service fails → Log error, return generic message
- Database fails → Log error, return generic message

### Phase 3: Update Reset Password Page

**File:** `reset-password.html`

**Changes:**

- Replace Supabase recovery session logic with token-based approach
- Extract token from URL parameters: `?token=xxx`
- Validate token exists (optional pre-check via API)
- Show form to enter new password
- On submit:
  - Call `/confirm-password-reset` endpoint with token + new password
  - Handle success: redirect to login
  - Handle errors: show appropriate message

**Token validation:**

- Client-side: Check token format (32 alphanumeric chars)
- Server-side: Check token exists, not used, not expired

### Phase 4: Edge Function - Confirm Password Reset

**Location:** `supabase/functions/confirm-password-reset/index.ts`

**Functionality:**

- Accept POST with token + new password
- Validate token:
  - Exists in database
  - Not expired
  - Not already used
- Get associated email from token
- Update password in Supabase Auth (`auth.users`)
- Mark token as used (prevent reuse)
- Delete token after 7 days (or immediately after use)
- Return success/error

**Error Handling:**

- Invalid/expired token → "Token expired or invalid"
- Password too weak → Supabase will reject, pass error back
- User not found → Shouldn't happen, log error
- Database error → Log, return generic error

### Phase 5: Update Login Page

**File:** `login.html` (already done, but verify)

**Current implementation:**

- Click "Forgot Password?" → Shows reset form
- Enter email → Calls `authService.resetPassword(email)`
- This calls Supabase's built-in function

**Changes needed:**

- Instead of `authService.resetPassword()`, call new Edge Function:
  - POST `/reset-password-request` with email
  - Show success message
  - Link back to login

---

## Database Schema Details

### password_reset_tokens table

| Column     | Type      | Purpose                       |
| ---------- | --------- | ----------------------------- |
| id         | UUID      | Primary key                   |
| user_id    | UUID      | Links to auth.users           |
| email      | TEXT      | User's email (for reference)  |
| token      | TEXT      | Random 32-char token (UNIQUE) |
| created_at | TIMESTAMP | When token was created        |
| expires_at | TIMESTAMP | When token expires (24h)      |
| used       | BOOLEAN   | Has this token been used?     |

---

## Resend Email Template

```html
<div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
  <img
    src="https://mepsketcher.com/logo.png"
    alt="MepSketcher"
    style="height: 40px;"
  />

  <h2>Reset Your Password</h2>

  <p>You requested a password reset for your MepSketcher account.</p>

  <p>
    <a
      href="{{ resetUrl }}"
      style="background-color: #007bff; color: white; padding: 10px 20px; 
                  text-decoration: none; border-radius: 5px; display: inline-block;"
    >
      Reset Password
    </a>
  </p>

  <p>Or copy this link: {{ resetUrl }}</p>

  <p style="color: #666; font-size: 12px;">
    This link expires in 24 hours. After that, you'll need to request a new
    password reset.
  </p>

  <hr />

  <p style="color: #666; font-size: 12px;">
    <strong>Didn't request this?</strong> Your account is secure. If you didn't
    request a password reset, you can safely ignore this email.
  </p>

  <footer style="color: #999; font-size: 11px;">
    &copy; 2026 MepSketcher. All rights reserved.
  </footer>
</div>
```

---

## Environment Variables Required

**In Supabase Project Settings → Edge Functions → Environment Variables:**

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
SITE_URL=https://mepsketcher.com
```

---

## Testing Checklist

### Local Testing (with local Supabase)

- [ ] Create test user account
- [ ] Request password reset
- [ ] Check token created in DB
- [ ] Verify email sent by Resend
- [ ] Click reset link
- [ ] Enter new password
- [ ] Confirm password updated
- [ ] Try using old password → fails
- [ ] Try using new password → succeeds
- [ ] Try reusing expired token → fails

### Edge Cases

- [ ] Reset link clicked twice (should fail 2nd time)
- [ ] Reset link after 24+ hours (should expire)
- [ ] Invalid token format (should be rejected)
- [ ] Password too weak (Supabase validation)
- [ ] Non-existent email (should return generic success)
- [ ] User deleted after token created (should fail gracefully)

### Production Deployment

- [ ] Environment variables set in Supabase
- [ ] RESEND_API_KEY is valid
- [ ] SITE_URL points to production domain
- [ ] Email template links point to production URL
- [ ] Database migrations applied
- [ ] Test with real email address
- [ ] Verify email delivery via Resend dashboard

---

## Code Cleanup - Remove Old Supabase Password Reset

Before implementing the new Edge Function approach, you'll need to clean up the old Supabase-based password reset code scattered across multiple files.

### 1. Remove resetPassword() from auth.js

**File:** `js/auth.js`

**Current code to REMOVE (lines ~306-318):**

```javascript
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
```

**Replace with:**

```javascript
// Reset password - handled by Edge Function (reset-password-request)
// No longer use Supabase's built-in resetPasswordForEmail
// See docs/PASSWORD_RESET_EDGE_FUNCTION_PLAN.md
```

### 2. Remove updatePassword() from auth.js

**File:** `js/auth.js`

**Current code to REMOVE (lines ~320-337):**

```javascript
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
```

**Replace with:**

```javascript
// Update password - handled by Edge Function (confirm-password-reset)
// Password updates are now done server-side with token validation
// See docs/PASSWORD_RESET_EDGE_FUNCTION_PLAN.md
```

### 3. Update Forgot Password Handler in login.html

**File:** `login.html`

**Current code to FIND (around line 232-250):**

```javascript
resetPasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("resetEmail").value.trim();

  // ... existing validation ...

  try {
    const result = await authService.resetPassword(email);

    if (result.success) {
      showMessage(resetMessage, result.message, "success");
      resetPasswordForm.reset();
      // ... existing redirect logic ...
    } else {
      showMessage(resetMessage, result.error, "error");
    }
  } catch (error) {
    // ... error handling ...
  }
});
```

**Replace with:**

```javascript
resetPasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("resetEmail").value.trim();
  const submitBtn = resetPasswordForm.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;

  // Validate email
  if (!email) {
    showMessage(resetMessage, "Please enter your email address.", "error");
    return;
  }

  // Disable submit button during processing
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    // Call the Edge Function to request password reset
    const response = await fetch(
      "https://jskwfvwbhyltmxcdsbnm.supabase.co/functions/v1/reset-password-request",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to request password reset");
    }

    showMessage(
      resetMessage,
      "Password reset link sent! Please check your email.",
      "success",
    );
    resetPasswordForm.reset();

    // Keep form visible for user to return to login
    setTimeout(() => {
      resetPasswordForm.classList.remove("active");
      resetPasswordForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
      loginForm.classList.add("active");
    }, 3000);
  } catch (error) {
    console.error("Password reset error:", error);
    showMessage(
      resetMessage,
      error.message || "Failed to send password reset link. Please try again.",
      "error",
    );
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});
```

### 4. Simplify reset-password.html

**File:** `reset-password.html`

**REMOVE:** All the complex Supabase session checking logic (lines ~98-159)

**Current problematic code:**

```javascript
// Check for error in URL (from Supabase auth redirect)
const hash = window.location.hash;
if (hash.includes("error=")) {
  // ... error handling ...
}

// ... all the session checking logic ...
if (error || !session) {
  // ... more complex logic ...
}
```

**Replace with simpler token extraction and validation:**

```javascript
async function initializeResetPage() {
  const form = document.getElementById("resetPasswordForm");
  const resetMessage = document.getElementById("resetMessage");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  // Helper function to display messages
  function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `auth-message ${type}`;
    element.style.display = "block";
  }

  // Extract token from URL query parameter
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  console.log("Reset page loaded with token:", token ? "present" : "missing");

  // Validate token exists
  if (!token) {
    showMessage(
      resetMessage,
      "Invalid or missing reset token. Please request a new password reset.",
      "error",
    );
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  // Optional: Pre-validate token with server (not required, server will validate on submit)
  // This is optional and can be skipped for faster UX

  // Handle form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    // Clear previous messages
    resetMessage.textContent = "";
    resetMessage.className = "auth-message";

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      showMessage(resetMessage, "Passwords do not match", "error");
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      showMessage(
        resetMessage,
        "Password must be at least 8 characters",
        "error",
      );
      return;
    }

    // Disable submit button during processing
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";

    try {
      // Call the Edge Function to confirm password reset
      const response = await fetch(
        "https://jskwfvwbhyltmxcdsbnm.supabase.co/functions/v1/confirm-password-reset",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            password: newPassword,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      showMessage(
        resetMessage,
        "Password updated successfully! Redirecting to login...",
        "success",
      );

      // Redirect to login page after 2 seconds
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2000);
    } catch (error) {
      console.error("Password reset error:", error);
      showMessage(
        resetMessage,
        error.message || "An unexpected error occurred. Please try again.",
        "error",
      );
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });
}

// Start initialization when DOM is ready
document.addEventListener("DOMContentLoaded", initializeResetPage);
```

### 5. Remove Supabase imports (if no longer needed)

**File:** `reset-password.html`

**Can REMOVE these lines if nothing else needs them:**

```html
<!-- Include Supabase JS SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Include our scripts -->
<script src="js/supabase-config.js"></script>
<script src="js/auth.js"></script>
```

The new code doesn't depend on Supabase client SDK for password reset functionality.

---

## Files to Create/Modify

### New Files to Create

- `supabase/functions/reset-password-request/index.ts` - Request handler
- `supabase/functions/reset-password-request/deno.json` - Dependencies
- `supabase/functions/confirm-password-reset/index.ts` - Confirmation handler
- `supabase/functions/confirm-password-reset/deno.json` - Dependencies

### Files to Modify (with Cleanup)

- `js/auth.js` - Remove resetPassword() and updatePassword() methods
- `login.html` - Update forgot password form submission
- `reset-password.html` - Replace entire script with simpler token-based approach

### Database

- Run migration SQL to create `password_reset_tokens` table

---

## Implementation Order

1. **Database Setup** - Create token table
2. **Resend Configuration** - Get API key, test
3. **Reset Request Function** - Handle email submission
4. **Reset Confirmation Function** - Handle password update
5. **Update login.html** - Call new function first (keeps old code working)
6. **Update reset-password.html** - Replace complex Supabase logic
7. **Remove old code from auth.js** - Delete resetPassword() and updatePassword()
8. **Testing** - Full flow validation
9. **Deployment** - Set env vars, deploy functions
10. **Final Cleanup** - Remove unused Supabase imports from reset-password.html

---

## Code Diff Summary

**Files modified:** 3

- `js/auth.js` - Remove 2 methods (~30 lines)
- `login.html` - Update 1 event handler (~50 lines)
- `reset-password.html` - Replace entire logic (~150 lines → ~80 lines)

**Lines removed:** ~200
**Lines added:** ~180
**Net change:** -20 lines (cleaner code!)

1. **Token Security:**
   - Use cryptographically secure random token (32+ characters)
   - Token should be one-time use only
   - Token must expire (24 hours recommended)
   - Don't expose token in logs

2. **Email Security:**
   - Don't reveal if email exists (return success regardless)
   - Use HTTPS-only reset links
   - Include "Didn't request this?" message
   - Sign emails with DKIM (Resend handles this)

3. **Password Update:**
   - Validate token before updating password
   - Use Supabase Auth to update (not direct DB)
   - Invalidate all other sessions after password change (future enhancement)

4. **Rate Limiting:**
   - Limit password reset requests per email (5 per hour)
   - Implement in Edge Function (future enhancement)

---

## Files to Create/Modify

### New Files to Create

- `supabase/functions/reset-password-request/index.ts` - Request handler
- `supabase/functions/reset-password-request/deno.json` - Dependencies
- `supabase/functions/confirm-password-reset/index.ts` - Confirmation handler
- `supabase/functions/confirm-password-reset/deno.json` - Dependencies

### Files to Modify

- `reset-password.html` - Update to use token-based flow
- `login.html` - Update forgot password handler
- `js/auth.js` - Remove Supabase resetPassword call or keep as fallback

### Database

- Run migration SQL to create `password_reset_tokens` table

---

## Implementation Order

1. **Database Setup** - Create token table
2. **Resend Configuration** - Get API key, test
3. **Reset Request Function** - Handle email submission
4. **Reset Confirmation Function** - Handle password update
5. **Update reset-password.html** - Token-based flow
6. **Update login.html** - Call new function
7. **Testing** - Full flow validation
8. **Deployment** - Set env vars, deploy functions

---

## Estimated Effort

- **Database Setup**: 15 minutes
- **Reset Request Function**: 45 minutes
- **Reset Confirmation Function**: 30 minutes
- **Frontend Updates**: 30 minutes
- **Testing**: 30 minutes
- **Deployment**: 15 minutes

**Total**: ~2.5 hours for full implementation

---

## Future Enhancements

1. **Rate Limiting** - Prevent brute force
2. **Audit Logging** - Track password reset attempts
3. **Session Invalidation** - Sign out all devices after reset
4. **Two-Factor Authentication** - Add 2FA for high security
5. **Admin Override** - Allow admins to reset user passwords
6. **Custom Reset Flow** - Allow users to choose verification method
7. **Internationalization** - Email templates in multiple languages

---

## Notes

- This approach gives you **complete control** over the password reset experience
- You can **customize the email** to match your branding
- **More reliable** than Supabase's default email service
- **Scalable** - can handle high volume of reset requests
- **Auditible** - all reset tokens logged in database
- **Secure** - follows industry best practices

---

## References

- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Resend Email: https://resend.com/docs
- Token Security: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
