# Mozilla Observatory Security Fixes Plan

**Branch**: `security/mozilla-observatory-fixes`  
**Date**: February 24, 2026

## Overview

This plan addresses 7 security issues identified by Mozilla Observatory scan, totaling -75 points in lost security score.

## Issues and Fixes

### Issue 1: Content Security Policy (CSP) - CRITICAL (-20 points)

**Status**: ⭕ Not Started

**Problem**:

- Contains `'unsafe-inline'` in `script-src`
- Contains `'unsafe-eval'` in `script-src`
- Contains `'unsafe-inline'` in `style-src`

**Root Cause**:

- Allows inline script execution and dynamic code evaluation
- Major attack vector for XSS (Cross-Site Scripting)

**Fix**:

- Remove `'unsafe-inline'` from script-src
- Remove `'unsafe-eval'` from script-src
- Remove `'unsafe-inline'` from style-src
- Move inline styles to external stylesheet
- Move inline scripts (lightbox modal, image modal) to external JS file

**Files to Modify**:

- `index.html` - Remove unsafe directives from CSP meta tag
- Create `js/lightbox.js` - Move image modal scripts to external file
- Update `css/style.css` - Add lightbox styling

**Verification**: CSP score should improve from -20 to 0

---

### Issue 2: X-Frame-Options (XFO) - CRITICAL (-20 points)

**Status**: ⭕ Not Started

**Problem**:

- X-Frame-Options header not implemented
- Website can be embedded in iframes on other sites (clickjacking risk)

**Root Cause**:

- No frame protection configured

**Fix**:

- Add `frame-ancestors` directive to CSP (preferred modern approach)
- Set `frame-ancestors 'none'` to prevent embedding in iframes
- Can set to `'self'` if self-embedding is needed

**Files to Modify**:

- `index.html` - Add `frame-ancestors 'none'` to CSP

**Verification**: XFO score should improve from -20 to 0

---

### Issue 3: Strict-Transport-Security (HSTS) - CRITICAL (-20 points)

**Status**: ⭕ Not Started

**Problem**:

- HSTS header not implemented
- Browser cannot enforce HTTPS-only connections
- Vulnerability to protocol downgrade attacks

**Root Cause**:

- Missing security header from server configuration

**Fix**:

- Add HSTS header to server responses
- Start with 1-month period (2592000 seconds) for testing
- Include `includeSubDomains` for all subdomains
- Add `preload` directive for HSTS preload list

**Server Configuration**:

```
Strict-Transport-Security: max-age=2592000; includeSubDomains; preload
```

**Implementation Location**:

- Netlify: Add to `netlify.toml` or site headers configuration
- GitHub Pages: If using, check custom domain HTTPS settings

**Verification**: HSTS score should improve from -20 to 0

---

### Issue 4: Redirection (HTTP to HTTPS) - MEDIUM (-5 points)

**Status**: ⭕ Not Started

**Problem**:

- Initial HTTP redirect goes to different host
- HSTS headers can't be recognized on HTTP
- Creates timing window for attack

**Root Cause**:

- Server redirects HTTP → different HTTPS host instead of same host

**Fix**:

- Configure redirect: HTTP://yourdomain.com → HTTPS://yourdomain.com
- Only then redirect if needed to www or other domain

**Implementation**:

- Update Netlify `netlify.toml` redirects
- Ensure primary domain serves on HTTPS first
- Check `_redirects` file configuration

**Verification**: Redirection score should improve from -5 to 0

---

### Issue 5: Subresource Integrity (SRI) - MEDIUM (-5 points)

**Status**: ⭕ Not Started

**Problem**:

- External scripts lack integrity checking
- Scripts: cdn.paddle.com, cdn.jsdelivr.net, supabase-js

**Root Cause**:

- No SRI hashes provided to verify script authenticity

**Fix**:

- Generate SRI hashes for all external scripts
- Add `integrity` attributes to script tags
- Update for each library version change

**External Scripts Requiring SRI**:

1. `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
2. `https://cdn.paddle.com/paddle/v2/paddle.js`

**How to Generate SRI**:

```bash
# Install openssl or use online SRI generator
# https://www.srihash.org/
```

**Files to Modify**:

- `index.html` - Add integrity attributes to script tags

**Verification**: SRI score should improve from -5 to 0

---

### Issue 6: X-Content-Type-Options - MEDIUM (-5 points)

**Status**: ⭕ Not Started

**Problem**:

- X-Content-Type-Options header missing
- Browser may MIME-sniff content (security risk)

**Root Cause**:

- Missing security header configuration

**Fix**:

- Add header: `X-Content-Type-Options: nosniff`

**Implementation**:

- Add to `netlify.toml` headers configuration
- Prevents browser MIME-type guessing

**Verification**: X-Content-Type-Options score should improve from -5 to 0

---

### Issue 7: Referrer-Policy - LOW (0 points, but required for completeness)

**Status**: ⭕ Not Started

**Problem**:

- Referrer-Policy header not set
- Referrer information leakage to external sites

**Root Cause**:

- Missing security header configuration

**Fix**:

- Add header: `Referrer-Policy: strict-origin-when-cross-origin`

**Implementation**:

- Add to `netlify.toml` headers configuration
- Or add meta tag: `<meta name="referrer" content="strict-origin-when-cross-origin">`

**Verification**: Best practice compliance

---

## Implementation Order

1. **Phase 1: HTML Meta Tags** (Low Risk)
   - Fix CSP meta tag (remove unsafe directives)
   - Add frame-ancestors to CSP
   - Add Referrer-Policy meta tag
   - Extract inline scripts to external file
   - Add SRI hashes to external scripts

2. **Phase 2: Server Configuration** (Requires Deployment)
   - Update `netlify.toml` with HSTS header
   - Update redirection rules
   - Add X-Content-Type-Options header
   - Add Referrer-Policy header (if not using meta tag)

3. **Phase 3: Testing & Validation**
   - Run Mozilla Observatory scan
   - Verify all scores improved
   - Test website functionality
   - Check browser console for CSP violation reports

## Testing & Validation

### Before Deployment

```bash
# Check current branch
git status

# Review all changes
git diff main

# Local testing (if possible)
# Run on local server and check headers with browser dev tools
```

### Post-Deployment

- Run Mozilla Observatory scan: https://observatory.mozilla.org/
- Run SSL Labs: https://www.ssllabs.com/ssltest/
- Run SecurityHeaders.com: https://securityheaders.com/
- Check browser console for CSP violations

### Expected Results

- CSP: -20 → 0 ✓
- X-Frame-Options: -20 → 0 ✓
- HSTS: -20 → 0 ✓
- Redirection: -5 → 0 ✓
- SRI: -5 → 0 ✓
- X-Content-Type-Options: -5 → 0 ✓
- Referrer-Policy: - → 0 ✓

**Total Score Improvement**: -75 → 0 (Perfect Score)

## Files to Modify

1. ✏️ `index.html` - CSP, SRI, frame-ancestors
2. ✏️ `netlify.toml` - HSTS, redirects, security headers
3. ✨ `js/lightbox.js` (NEW) - Extract lightbox script
4. ✨ `_redirects` (VERIFY) - Check if exists and update

## Risks & Considerations

### Low Risk

- Removing unsafe-inline/unsafe-eval from CSP (modern best practice)
- Adding SRI to external scripts (backward compatible)
- Adding security headers (no impact on functionality)

### Medium Risk

- Extracting inline scripts - must verify lightbox functionality after extraction
- HTTP→HTTPS redirection change - test redirect flow

### No Risk

- Referrer-Policy header (informational, not blocking)

## Rollback Plan

If issues arise after deployment:

1. Revert to main branch
2. Redeploy previous version
3. Fix issues in new PR with limited scope

All changes are non-breaking and can be safely reverted.

---

## Status Tracking

| Task                   | Status | Notes                                           |
| ---------------------- | ------ | ----------------------------------------------- |
| CSP Fixes              | ⭕     | Remove unsafe-inline/-eval, add frame-ancestors |
| Extract Inline Scripts | ⭕     | Create lightbox.js                              |
| Add SRI Hashes         | ⭕     | Use srihash.org                                 |
| HSTS Header            | ⭕     | Via netlify.toml                                |
| Redirection Rules      | ⭕     | Check \_redirects config                        |
| X-Content-Type-Options | ⭕     | Via netlify.toml                                |
| Referrer-Policy        | ⭕     | Via meta tag or header                          |
| Testing & Validation   | ⭕     | Run observatory scans                           |

---

**Next Step**: Start with Phase 1 (HTML modifications)
