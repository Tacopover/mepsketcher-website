# Security Pre-Launch Checklist

This document tracks the security measures implemented for the MepSketcher website before going live.

## ✅ Completed Security Fixes

### Critical Security Implementations

- [x] **Content Security Policy (CSP)** - Added to all HTML pages

  - `index.html`
  - `dashboard.html`
  - `login.html`
  - `accept-invitation.html`
  - `purchase-success.html`

- [x] **HTTPS Enforcement** - Added to `main.js`

  - Automatically redirects HTTP to HTTPS in production
  - Excludes localhost for development

- [x] **Debug Functions Gated** - Production protection

  - `auth.js` debug functions only exposed in development
  - `paddle-config.js` debug functions only exposed in development
  - Prevents information disclosure in production

- [x] **Test Files Removed from Git**

  - `test-jwt-claims.html` - removed from tracking
  - `paddle-test.html` - removed from tracking
  - `js/test-jwt-claims.js` - removed from tracking
  - Added to `.gitignore` to prevent re-addition

- [x] **Timing-Safe Webhook Signature Verification**

  - Updated `paddle-webhook/index.ts`
  - Uses `crypto.subtle.timingSafeEqual()` to prevent timing attacks

- [x] **Input Validation**

  - Email format validation in `signup/index.ts`
  - Email format validation in `signin/index.ts`
  - Password strength validation (minimum 8 characters) in `signup/index.ts`

- [x] **Sensitive Data Protection**
  - All API keys stored as environment variables
  - `.gitignore` properly configured
  - No hardcoded secrets in repository

## ⚠️ Pre-Launch Tasks (Action Required)

### Before Publishing to Production

- [ ] **Switch Paddle from Sandbox to Production**

  - Update `PaddleConfig.environment` in `js/paddle-config.js`
  - Replace `clientToken` with production token
  - Update price IDs for production

- [ ] **Delete or Protect Test Files**

  - Consider deleting `paddle-test.html` completely
  - Or move to a `/dev` folder not served in production

- [ ] **Add CAPTCHA to Forms** (Recommended)

  - Signup form
  - Login form
  - Prevents brute force attacks and spam

- [ ] **Implement Rate Limiting** (Recommended)

  - Add to Supabase Edge Functions
  - Consider using Cloudflare or similar service
  - Limit auth endpoints to prevent abuse

- [ ] **Add Security Headers** (Hosting Provider)
      Configure these headers at your hosting provider level:

  ```
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```

- [ ] **Tighten CSP Further** (Optional but Recommended)
      Try to remove `'unsafe-inline'` and `'unsafe-eval'`:

  - Move all inline scripts to external files
  - Test Paddle integration without unsafe directives
  - Use nonces or hashes for necessary inline scripts

- [ ] **Add Subresource Integrity (SRI)** (Recommended)
      Add SRI hashes to external scripts:

  ```html
  <script
    src="https://cdn.paddle.com/paddle/v2/paddle.js"
    integrity="sha384-HASH_HERE"
    crossorigin="anonymous"
  ></script>
  ```

- [ ] **Review Error Messages**

  - Ensure production errors don't expose internal details
  - Keep detailed errors in server logs only

- [ ] **Security Testing**

  - Run OWASP ZAP or similar scanner
  - Test authentication flows
  - Verify HTTPS enforcement
  - Test CSP compliance
  - Verify webhook signature validation

- [ ] **Monitor Setup**
  - Set up Supabase auth monitoring
  - Configure alerts for unusual activity
  - Monitor failed login attempts

## 📝 Environment Configuration

### Required Environment Variables (Supabase)

Verify these are set in Supabase Dashboard → Project Settings → Edge Functions:

- `SUPABASE_URL` - Auto-configured
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-configured
- `SUPABASE_ANON_KEY` - Auto-configured
- `PADDLE_WEBHOOK_SECRET` - Set from Paddle Dashboard
- `RESEND_API_KEY` - Set from Resend Dashboard
- `CLEANUP_SECRET_KEY` - Generate a secure random string

## 🔒 Security Best Practices Currently Implemented

1. ✅ All secrets in environment variables (not in code)
2. ✅ `.gitignore` properly configured
3. ✅ Row Level Security (RLS) policies in Supabase
4. ✅ Password hashing handled by Supabase Auth
5. ✅ JWT token-based authentication
6. ✅ CORS headers properly configured
7. ✅ Webhook signature verification
8. ✅ Input validation on auth endpoints
9. ✅ Timing-safe comparisons for sensitive operations
10. ✅ HTTPS enforcement in production

## 🚨 Known Limitations

### Current CSP Allows

- `'unsafe-inline'` - Required for current inline scripts
- `'unsafe-eval'` - May be required by Paddle SDK

**Note**: These should be removed if possible after testing.

### No Built-in Rate Limiting

Consider implementing at CDN/hosting level (Cloudflare, etc.)

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/auth-deep-dive/auth-deep-dive-jwts)
- [Paddle Security Guide](https://developer.paddle.com/webhook-reference/verifying-webhooks)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

## ✅ Final Pre-Launch Verification

Before going live, verify:

1. All test files deleted or moved
2. Debug functions disabled in production
3. HTTPS enforced
4. CSP headers present on all pages
5. Paddle in production mode
6. All environment variables configured
7. Security headers configured at hosting level
8. Error messages sanitized for production
9. Monitoring and alerts configured
10. Security scan completed

---

**Last Updated**: December 2, 2025
**Status**: Ready for pre-launch testing
