# Payment Flow Implementation - TODO Checklist

Quick reference checklist for implementing the signup → trial → payment flow.

See `PAYMENT_FLOW_IMPLEMENTATION_PLAN.md` for detailed specifications.

---

## ✅ Phase 1: Database Setup ✅ COMPLETE

### Schema Migrations

- [x] Add `user_id` column to `pending_organizations` table ✅
- [x] Add index on `pending_organizations.user_id` ✅
- [x] Add index on `pending_organizations.user_email` ✅
- [x] Add `is_trial` column to `organizations` table (default: true) ✅
- [x] Add `trial_expires_at` column to `organizations` table (default: NOW() + 14 days) ✅
- [x] Add index on `organizations.trial_expires_at` ✅
- [x] Add `trial_expires_at` column to `organization_licenses` table (nullable) ✅
- [x] Update `organization_licenses.used_licenses` default to 1 ✅
- [x] Test all migrations in Supabase dashboard ✅
- [x] Update `SUPABASE_SCHEMA.md` with new columns ✅

**Status**: ✅ Complete

---

## ✅ Phase 2: Signup Edge Function ✅ COMPLETE

### File: `supabase/functions/signup/index.ts`

**Status**: ✅ Complete and deployed

Current functionality:

- [x] Creates auth user via Supabase Auth ✅
- [x] Inserts into `user_profiles` table (if email confirmed) ✅
- [x] Inserts into `pending_organizations` table (if email NOT confirmed) ✅
- [x] Handles duplicate user errors ✅
- [x] Has proper error logging ✅
- [x] Deployed and working ✅

**Updates completed for trial flow**:

- [x] Modified to add `user_id` to `pending_organizations` insert ✅
- [x] Tested with updated schema ✅
- [x] Deployed to production ✅

**Status**: ✅ Complete

---

## ✅ Phase 3: Update Signin Edge Function ✅ COMPLETE

### File: `supabase/functions/signin/index.ts`

**Status**: ✅ Complete and deployed

**Trial flow updates completed**:

- [x] Updated SignInResponse interface with organization field ✅
- [x] When creating organization from pending, add trial fields:
  - [x] Set `is_trial: true` ✅
  - [x] Set `trial_expires_at: NOW() + 14 days` ✅
- [x] Query organization after signin ✅
- [x] Return trial status in response (isTrial, trialExpiresAt, daysRemaining) ✅
- [x] Deployed updated function ✅
- [x] Tested end-to-end signup → confirm → login flow ✅

**Status**: ✅ Complete

---

## ✅ Phase 4: Paddle Webhook Handler ✅ COMPLETE

### File: `supabase/functions/paddle-webhook/index.ts`

**Status**: ✅ Complete and working in production

**Implementation completed**:

- [x] Handler for `transaction.completed` event ✅
- [x] Verify Paddle webhook signature ✅
- [x] Extract `organization_id` from custom_data ✅
- [x] Extract `license_count` from transaction quantity ✅
- [x] Ensure user is in `organization_members` (with role 'admin') ✅
- [x] Insert into `organization_licenses` table:
  - [x] Set `total_licenses` from purchase quantity ✅
  - [x] Set `used_licenses` to 1 (owner already exists in org_members) ✅
  - [x] Set `license_type` to 'standard' ✅
  - [x] Set `expires_at` to NOW() + 1 year ✅
  - [x] Set `paddle_id` from subscription/transaction ID ✅
- [x] Update `organizations.is_trial` to false ✅
- [x] Comprehensive error logging ✅
- [x] Fixed RLS policies (removed function references, made inline) ✅
- [x] Fixed role constraint (changed 'owner' to 'admin') ✅
- [x] Fixed JWT verification issue (disabled for webhook) ✅
- [x] Tested with real Paddle transactions ✅
- [x] Verified rows created in both tables ✅

**Critical Configuration**:

- [x] Added `config.toml` file with `verify_jwt = false` ✅
- [x] Documented `--no-verify-jwt` flag for deployments (see below) ✅

**Status**: ✅ Complete and verified working

### 🔧 Important: Deploying Paddle Webhook

The paddle-webhook function **MUST** be deployed with JWT verification disabled to accept external webhook calls from Paddle.

**Method 1: Using config.toml (Recommended)**
Create `supabase/functions/paddle-webhook/config.toml`:

```toml
[function]
verify_jwt = false
```

**Method 2: Using deployment flag**

```powershell
npx supabase functions deploy paddle-webhook --no-verify-jwt
```

⚠️ **IMPORTANT**: Always use `--no-verify-jwt` when deploying this function, as redeployment can re-enable JWT verification even with config.toml present.

**Other edge functions (signup, signin) should keep JWT verification enabled.**

---

## ✅ Phase 5: Frontend Paddle Integration ✅ COMPLETE

### File: `js/paddle.js`

**Status**: ✅ Complete and working

**Implementation completed**:

- [x] Initialize Paddle with vendor ID ✅
- [x] Create checkout button integration ✅
- [x] Pass custom_data to Paddle:
  - [x] user_id ✅
  - [x] organization_id ✅ (CRITICAL FIX)
  - [x] user_email ✅
  - [x] license_type ✅
  - [x] product ✅
  - [x] version ✅
  - [x] timestamp ✅
- [x] Handle checkout success callback ✅
- [x] Handle checkout errors ✅
- [x] Tested with Paddle sandbox ✅
- [x] Verified end-to-end payment flow ✅

**Status**: ✅ Complete

---

## 🔄 Phase 6: Frontend Login Integration

### File: `js/login-page.js` or `js/auth.js`

**Status**: 🔄 Needs update to handle trial response

- [ ] Update login handler to process trial info from signin response
- [ ] Store organization details in localStorage (orgId, isTrial, trialExpiresAt)
- [ ] Calculate and store trial days remaining
- [ ] Redirect to dashboard after successful login
- [ ] Handle errors gracefully
- [ ] Test with new trial users
- [ ] Test with existing paid users

**Estimated Time**: 30 minutes - 1 hour

---

## 🔄 Phase 7: Dashboard Trial UI

### File: `js/dashboard.js`

- [ ] Create trial banner component (HTML/CSS)
- [ ] Calculate and display days remaining in trial
- [ ] Show "Upgrade to Paid" button in banner
- [ ] Add trial expiry countdown timer
- [ ] Check trial status on dashboard load
- [ ] Disable team member invitation UI during trial
- [ ] Add trial watermark logic for PDF exports
- [ ] Handle trial expired state (block features, show modal)
- [ ] Style trial banner to be prominent but not intrusive
- [ ] Test with trial organization
- [ ] Test with paid organization (no banner)

**Estimated Time**: 3-4 hours

---

## 🔄 Phase 8: Pricing & Checkout Page

### Files: `pricing.html` (NEW), `js/paddle-checkout.js` (NEW)

- [ ] Create pricing page HTML structure
- [ ] Add license quantity selector UI
- [ ] Add pricing calculation display
- [ ] Handle checkout success callback
- [ ] Handle checkout close callback
- [ ] Redirect to dashboard after successful payment
- [ ] Add loading states during checkout
- [ ] Style pricing page
- [ ] Test complete purchase flow

**Estimated Time**: 3-4 hours

---

## 🔄 Phase 9: Trial Expiry Enforcement

### Files: Multiple

- [ ] Create database function/RPC to check trial expiry
- [ ] Add frontend check on dashboard load
- [ ] Show "Trial Expired" modal when expired
- [ ] Block feature access after expiry
- [ ] Redirect to pricing page when trying to use expired trial
- [ ] Add grace period of 3 days (optional)
- [ ] Send trial expiry warning emails (optional, future phase)
- [ ] Test with manually expired trial
- [ ] Test grace period behavior

**Estimated Time**: 2-3 hours

---

## 🔄 Phase 10: Testing & Validation

### End-to-End Tests

- [x] Test complete signup flow ✅
- [x] Test payment flow (Paddle checkout + webhook) ✅
- [x] Verify license creation in database ✅
- [x] Verify organization_members creation ✅
- [ ] Test trial period behavior
- [ ] Test trial expiry enforcement
- [ ] Test PDF watermark
- [ ] Test error cases
- [ ] Test with multiple browsers
- [ ] Test on mobile devices

**Estimated Time**: 3-4 hours

---

## 📝 Phase 11: Documentation Updates

- [ ] Update `README.md` with new flow
- [x] Update `SUPABASE_SCHEMA.md` with new columns ✅
- [x] Document Paddle webhook deployment requirements ✅
- [ ] Document trial period length configuration
- [ ] Add troubleshooting guide
- [ ] Document environment variables needed

**Estimated Time**: 1 hour

---

## 🚀 Phase 12: Production Deployment

- [x] Deploy all edge functions to production ✅
- [x] Update database schema in production ✅
- [x] Configure Paddle webhook URL in Paddle dashboard ✅
- [x] Test with real Paddle transaction ✅
- [ ] Monitor error logs for first 24 hours
- [ ] Set up alerts for webhook failures

**Estimated Time**: 1-2 hours

---

## Total Progress

**Completed**: Phases 1-5 (Backend infrastructure complete)  
**Remaining**: Phases 6-12 (Frontend UI and testing)  
**Estimated Time Remaining**: 12-16 hours

---

## Current Status: 🚀 Backend Complete, Frontend In Progress

### Already Completed:

- ✅ Database migrations
- ✅ Signup edge function updated
- ✅ Signin edge function updated with trial logic
- ✅ Paddle webhook function complete and working
- ✅ Frontend Paddle integration complete
- ✅ Fixed RLS policies
- ✅ Fixed role constraints
- ✅ Fixed JWT verification issues
- ✅ End-to-end payment flow tested and working

### Ready to Implement:

- Phase 6: Frontend login integration (handle trial response)
- Phase 7: Dashboard trial UI (banner, countdown)
- Phase 8: Pricing page UI
- Phase 9: Trial expiry enforcement
- Phase 10: Complete testing suite

### In Progress:

- None

### Blocked:

- None

---

## Lessons Learned

### Issues Resolved:

1. **Missing `organizationId` in Paddle custom_data** → Fixed by querying organization before checkout
2. **Role constraint violation** → Changed 'owner' to 'admin' in organization_members inserts
3. **RLS "permission denied for schema auth"** → Removed function calls with `auth.uid()`, made checks inline
4. **JWT verification blocking webhook** → Disabled JWT verification for paddle-webhook function
5. **Signature verification** → Implemented proper Paddle v2 signature format (ts:body)

### Critical Configuration:

- Paddle webhook MUST have JWT verification disabled (`--no-verify-jwt` flag)
- RLS policies must not use functions that reference auth schema when service role is involved
- Role values must match database check constraints ('admin', 'member', not 'owner')
- organizationId must be passed in Paddle custom_data for trial → paid conversion

---

## Notes & Issues

### Open Questions:

1. Trial period length: 14 days confirmed ✅
2. License type: Single "standard" type only ✅
3. Payment provider: Paddle confirmed ✅
4. Trial features: All features with PDF watermark ✅
5. Expiry behavior: Block access confirmed ✅

### Known Issues:

- None

### Future Enhancements (Post-MVP):

- Team member invitations
- License renewals
- Plan upgrades/downgrades
- Multiple organizations per user
- Trial expiry email notifications
- Automated trial expiry reminders
