# Payment Flow Implementation Plan

## Overview

This document outlines the implementation plan for the signup → trial → payment flow in the MepSketcher website.

## Key Flow Principles

1. **Trial Period**: Users get 14-day trial access to all features with PDF watermark
2. **Organization Creation**: Happens on first login (not after payment)
3. **License Creation**: ONLY happens after Paddle payment
4. **Single License Type**: Only one license type (no starter/pro/enterprise tiers)
5. **One Organization Per User**: Users can only own one organization (member of multiple comes later)

---

## Complete User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          PHASE 1: SIGNUP                         │
└─────────────────────────────────────────────────────────────────┘

1. User fills signup form (email, password, name, org name)
   └─> POST to Supabase Auth: signUp()
       ├─> Creates auth.users entry (email NOT confirmed yet)
       ├─> Metadata: {name: "John Doe"}
       └─> Returns: {user, session} with confirmation_sent_at

2. Edge Function (signup): Create user profile + pending org
   └─> Insert into user_profiles (id, email, name)
   └─> Insert into pending_organizations (user_id, user_email, organization_name, user_name)
   └─> Returns: {success: true, requiresEmailConfirmation: true}

3. User receives confirmation email
   └─> User clicks confirmation link
   └─> Supabase confirms email (email_confirmed_at set)
   └─> NO automatic database operations

Database State:
✅ auth.users (email confirmed)
✅ user_profiles
✅ pending_organizations
❌ organizations (not yet)
❌ organization_members (not yet)
❌ organization_licenses (not yet)

┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 2: FIRST LOGIN (TRIAL)                   │
└─────────────────────────────────────────────────────────────────┘

4. User logs in for first time after email confirmation
   └─> POST to Supabase Auth: signInWithPassword()
   └─> Frontend: Check for pending organizations

5. Frontend/Edge Function: Process pending organization
   └─> Query pending_organizations WHERE user_id = current_user.id
   └─> If found:
       ├─> Create organization (name, owner_id, is_trial: true)
       ├─> Add user to organization_members (role: 'admin')
       ├─> Set trial expiry: organizations.trial_expires_at = NOW() + 14 days
       └─> Delete pending_organizations entry
   └─> Redirect to dashboard with trial banner

Database State:
✅ auth.users
✅ user_profiles
✅ organizations (is_trial: true, trial_expires_at set)
✅ organization_members (owner as admin)
❌ organization_licenses (trial users don't have this)
❌ pending_organizations (deleted)

6. User accesses dashboard in TRIAL mode
   └─> Show trial banner: "14 days remaining"
   └─> All features available
   └─> PDF exports have watermark: "Trial Version - Purchase license at mepsketcher.com"
   └─> Cannot invite team members during trial

┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 3: PAYMENT DECISION                     │
└─────────────────────────────────────────────────────────────────┘

7. User decides to purchase (during or after trial)
   └─> Clicks "Upgrade to Paid" button
   └─> Redirects to pricing/checkout page
   └─> Shows single plan with license count selector

8. Paddle checkout initiated
   └─> Pass custom data:
       {
         user_id: "uuid",
         organization_id: "uuid",
         user_email: "email@example.com"
       }
   └─> User completes payment

┌─────────────────────────────────────────────────────────────────┐
│              PHASE 4: PAYMENT SUCCESS (PADDLE WEBHOOK)           │
└─────────────────────────────────────────────────────────────────┘

9. Paddle webhook: transaction.completed
   └─> Verify webhook signature
   └─> Extract data:
       ├─> organization_id (from custom_data)
       ├─> user_id (from custom_data)
       ├─> license_count (from quantity)
       ├─> paddle_subscription_id
       ├─> paddle_transaction_id
       └─> amount paid

10. Edge Function: Create license record
    └─> Insert into organization_licenses:
        ├─> organization_id
        ├─> total_licenses (from purchase)
        ├─> used_licenses: 1 (owner already in org_members)
        ├─> license_type: 'standard'
        ├─> expires_at: NOW() + 1 year
        ├─> paddle_id: subscription_id or transaction_id
        └─> trial_expires_at: NULL (no longer trial)

11. Update organization status
    └─> Update organizations SET is_trial = false WHERE id = organization_id

12. Send confirmation email
    └─> "Your MepSketcher license is now active!"

Database State (FINAL):
✅ auth.users
✅ user_profiles
✅ organizations (is_trial: false)
✅ organization_members
✅ organization_licenses (paid license active)
❌ pending_organizations

13. User logs in after payment
    └─> No trial banner
    └─> No PDF watermark
    └─> Can now invite team members
```

---

## Database Schema Changes Required

### 1. Add columns to `pending_organizations` table

```sql
ALTER TABLE pending_organizations
ADD COLUMN IF NOT EXISTS user_id text REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_organizations_user_id
ON pending_organizations(user_id);

CREATE INDEX IF NOT EXISTS idx_pending_organizations_user_email
ON pending_organizations(user_email);
```

**Purpose**: Link pending org to user_id after signup (in addition to email)

### 2. Add trial tracking to `organizations` table

```sql
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS trial_expires_at timestamp with time zone DEFAULT (NOW() + INTERVAL '14 days');

-- Add index for trial expiry checks
CREATE INDEX IF NOT EXISTS idx_organizations_trial_expires
ON organizations(trial_expires_at)
WHERE is_trial = true;
```

**Purpose**: Track trial status and expiry date

### 3. Add trial expiry to `organization_licenses` table (optional)

```sql
ALTER TABLE organization_licenses
ADD COLUMN IF NOT EXISTS trial_expires_at timestamp with time zone;

-- Note: This column will be NULL for paid licenses
-- Only used if converting trial to paid and tracking original trial period
```

**Purpose**: Optional - track original trial period even after conversion to paid

### 4. Update `organization_licenses` default for `used_licenses`

```sql
-- Current default is 0, but should be 1 when created (owner already exists)
ALTER TABLE organization_licenses
ALTER COLUMN used_licenses SET DEFAULT 1;
```

**Purpose**: New paid licenses should start at 1 (owner already in org_members)

---

## Implementation Phases

### Phase 1: Database Schema Updates ✅

**Goal**: Prepare database for new flow

- [ ] Run schema migrations to add new columns
- [ ] Verify columns exist in Supabase dashboard
- [ ] Test constraints work correctly

**Files to modify**: None (SQL migrations only)

---

### Phase 2: Signup Edge Function 🔄

**Goal**: Handle signup and create pending organization

**Edge Function**: `supabase/functions/signup/index.ts`

**Responsibilities**:

1. Create user profile in `user_profiles` table
2. Create pending organization entry with user_id and email
3. Return success with email confirmation required

**Input**:

```typescript
{
  email: string,
  password: string,
  name: string,
  organizationName: string
}
```

**Output**:

```typescript
{
  success: boolean,
  requiresEmailConfirmation: boolean,
  error?: string
}
```

**Tasks**:

- [ ] Modify existing signup edge function
- [ ] Add user_profiles insert
- [ ] Add pending_organizations insert (with user_id)
- [ ] Handle duplicate email/user errors
- [ ] Add proper error handling
- [ ] Test locally with Supabase CLI

---

### Phase 3: First Login Processing 🔄

**Goal**: Create organization on first login after email confirmation

**Edge Function**: `supabase/functions/process-first-login/index.ts` (NEW)

**Responsibilities**:

1. Check if user has pending organization
2. If yes: Create organization (with trial settings)
3. Add user as admin to organization_members
4. Delete pending_organizations entry
5. Return organization details

**Input**:

```typescript
{
  userId: string;
}
```

**Output**:

```typescript
{
  hasPendingOrg: boolean,
  organization?: {
    id: string,
    name: string,
    isTrial: boolean,
    trialExpiresAt: string,
    daysRemaining: number
  }
}
```

**Tasks**:

- [ ] Create new edge function file
- [ ] Implement pending org lookup
- [ ] Create organization with trial flags
- [ ] Add user to organization_members
- [ ] Delete pending_organizations entry
- [ ] Calculate trial days remaining
- [ ] Add error handling for transaction failures
- [ ] Test with Supabase CLI

---

### Phase 4: Frontend Login Integration 🔄

**Goal**: Call process-first-login after successful authentication

**File**: `mepsketcher-website/js/auth.js` (or login-page.js)

**Tasks**:

- [ ] Add function to call process-first-login edge function
- [ ] Call after successful login
- [ ] Handle response and store org details
- [ ] Show trial banner if is_trial = true
- [ ] Redirect to dashboard
- [ ] Handle errors gracefully

---

### Phase 5: Dashboard Trial Features 🔄

**Goal**: Show trial status and enforce trial limitations

**File**: `mepsketcher-website/js/dashboard.js`

**Tasks**:

- [ ] Add trial banner component
- [ ] Display days remaining in trial
- [ ] Show "Upgrade" button
- [ ] Add trial expiry countdown
- [ ] Disable team member invitations during trial
- [ ] Add "Trial Version" watermark logic for PDF exports
- [ ] Check trial expiry on dashboard load

---

### Phase 6: Paddle Webhook Handler 🔄

**Goal**: Process payment and create license record

**Edge Function**: `supabase/functions/paddle-webhook/index.ts` (MODIFY EXISTING)

**Responsibilities**:

1. Verify Paddle webhook signature
2. Handle `transaction.completed` event
3. Extract organization_id and license count from custom_data
4. Create organization_licenses entry
5. Update organization is_trial = false
6. Send confirmation email

**Input**: Paddle webhook payload

**Output**: 200 OK (webhook acknowledgment)

**Tasks**:

- [ ] Modify existing paddle webhook function
- [ ] Add transaction.completed event handler
- [ ] Extract custom_data from webhook
- [ ] Insert into organization_licenses table
- [ ] Update organizations.is_trial to false
- [ ] Set used_licenses = 1 (owner already exists)
- [ ] Calculate expires_at (1 year from now)
- [ ] Add error handling and logging
- [ ] Test with Paddle sandbox

---

### Phase 7: Pricing/Checkout Page 🔄

**Goal**: Create checkout flow with Paddle integration

**Files**:

- `mepsketcher-website/pricing.html` (NEW or modify existing)
- `mepsketcher-website/js/paddle-checkout.js` (NEW)

**Tasks**:

- [ ] Create pricing page UI
- [ ] Add license quantity selector
- [ ] Integrate Paddle.js
- [ ] Pass custom_data (user_id, organization_id) to Paddle
- [ ] Handle checkout success/failure
- [ ] Redirect to dashboard after successful payment
- [ ] Add loading states

---

### Phase 8: Trial Expiry Handling 🔄

**Goal**: Enforce trial expiry restrictions

**Tasks**:

- [ ] Create database function to check trial expiry
- [ ] Add frontend check on dashboard load
- [ ] Show "Trial Expired" banner if expired
- [ ] Block feature access after expiry
- [ ] Force redirect to pricing page
- [ ] Add grace period (optional)

---

### Phase 9: Testing & Validation ✅

**Goal**: Ensure entire flow works end-to-end

**Tasks**:

- [ ] Test signup → email confirm → first login flow
- [ ] Test trial period tracking
- [ ] Test Paddle payment in sandbox
- [ ] Test license creation after payment
- [ ] Test trial expiry behavior
- [ ] Test error cases (payment failure, duplicate org, etc.)
- [ ] Test with multiple users

---

## Files to Create/Modify

### New Files:

1. `supabase/functions/process-first-login/index.ts` - Process pending org on first login
2. `mepsketcher-website/js/paddle-checkout.js` - Paddle checkout integration
3. `mepsketcher-website/pricing.html` - Pricing/checkout page (if doesn't exist)
4. `DATABASE_MIGRATIONS.sql` - Schema changes

### Modified Files:

1. `supabase/functions/signup/index.ts` - Add user_profiles and pending_organizations creation
2. `supabase/functions/paddle-webhook/index.ts` - Add license creation logic
3. `mepsketcher-website/js/auth.js` - Add process-first-login call
4. `mepsketcher-website/js/dashboard.js` - Add trial banner and restrictions
5. `mepsketcher-website/SUPABASE_SCHEMA.md` - Update with new columns

---

## Environment Variables Required

### Supabase Edge Functions:

```env
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PADDLE_WEBHOOK_SECRET=your-paddle-webhook-secret
```

### Frontend:

```env
PADDLE_VENDOR_ID=your-paddle-vendor-id
PADDLE_PRODUCT_ID=your-paddle-product-id
PADDLE_ENVIRONMENT=sandbox|production
```

---

## Testing Checklist

### Signup Flow:

- [ ] User can sign up with email/password/name/org name
- [ ] User receives confirmation email
- [ ] user_profiles entry created
- [ ] pending_organizations entry created with user_id

### First Login Flow:

- [ ] User can login after email confirmation
- [ ] Organization created with is_trial = true
- [ ] Trial expiry set to 14 days from now
- [ ] User added to organization_members as admin
- [ ] pending_organizations entry deleted
- [ ] Dashboard shows trial banner

### Trial Period:

- [ ] Trial days remaining calculated correctly
- [ ] PDF exports show watermark
- [ ] Team invitations blocked
- [ ] Trial expiry warning shown

### Payment Flow:

- [ ] Paddle checkout opens correctly
- [ ] Custom data passed to Paddle
- [ ] Webhook receives payment notification
- [ ] organization_licenses entry created
- [ ] is_trial set to false
- [ ] used_licenses set to 1
- [ ] expires_at set to 1 year from payment

### Post-Payment:

- [ ] Dashboard no longer shows trial banner
- [ ] PDF exports no watermark
- [ ] Team invitations enabled (future phase)
- [ ] License details shown in dashboard

---

## Risk Areas & Considerations

### 1. Trial Expiry Edge Cases

- What if user signs up but never logs in? Trial starts on first login, not signup
- What if trial expires while user is logged in? Check on page load
- Grace period after expiry? TBD

### 2. Payment Race Conditions

- User pays while trial is active - webhook updates is_trial to false
- User pays multiple times - check for existing license before creating new one
- Webhook arrives before user returns to site - that's fine, dashboard will reflect paid status

### 3. Organization Uniqueness

- One user can only own one organization
- Check if user already owns an org before creating from pending_organizations
- Prevent creating multiple pending_organizations for same user

### 4. Trial to Paid Conversion

- When converting from trial to paid, used_licenses should be 1 (owner)
- Trial expiry date should be ignored after payment
- Keep trial_expires_at for historical tracking (optional)

---

## Success Metrics

- ✅ User can complete entire flow: signup → trial → payment
- ✅ No orphaned records in database
- ✅ Trial period enforced correctly
- ✅ Payment creates valid license
- ✅ No errors in production logs
- ✅ Paddle webhooks processed successfully

---

## Next Steps After Initial Implementation

1. **Team Member Invitations** (Future Phase)

   - Add invitation system
   - Validate license availability
   - Increment used_licenses when adding members

2. **License Renewals** (Future Phase)

   - Handle subscription renewal webhooks
   - Update expires_at on renewal
   - Handle payment failures

3. **Plan Upgrades** (Future Phase)

   - Allow changing license count
   - Update total_licenses
   - Pro-rate payments

4. **Multiple Organizations** (Much Later)
   - Allow users to be members of multiple orgs
   - Switch between orgs in dashboard
   - Separate trial per organization
