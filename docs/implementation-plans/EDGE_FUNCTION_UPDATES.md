# Edge Function Updates Summary

Since signup, signin, and paddle-webhook edge functions already exist, here's exactly what needs to be updated in each.

---

## 1. Signup Function Updates

**File**: `supabase/functions/signup/index.ts`

### Current Behavior:

- Creates auth user
- If email confirmed: creates user_profile + organization immediately
- If email NOT confirmed: creates pending_organizations entry

### Changes Needed:

#### Add `user_id` to pending_organizations insert:

**Location**: Line ~260 (in the "Email NOT confirmed" branch)

**Current code**:

```typescript
const { error: pendingError } = await supabaseAdmin
  .from("pending_organizations")
  .insert({
    user_email: email,
    user_name: name,
    organization_name: orgName,
  });
```

**Updated code**:

```typescript
const { error: pendingError } = await supabaseAdmin
  .from("pending_organizations")
  .insert({
    user_id: userId, // ← ADD THIS
    user_email: email,
    user_name: name,
    organization_name: orgName,
  });
```

**That's it!** This function is otherwise complete for the trial flow.

---

## 2. Signin Function Updates

**File**: `supabase/functions/signin/index.ts`

### Current Behavior:

- Authenticates user
- Upserts user_profiles
- Processes pending_organizations (creates org + adds member)
- Returns user info

### Changes Needed:

#### Change 1: Add trial fields when creating organization

**Location**: Line ~168 (in the "Create new organization" branch)

**Current code**:

```typescript
const { data: newOrg, error: orgError } = await supabaseAdmin
  .from("organizations")
  .insert({
    name: pendingOrg.organization_name,
    owner_id: userId,
  })
  .select()
  .single();
```

**Updated code**:

```typescript
const { data: newOrg, error: orgError } = await supabaseAdmin
  .from("organizations")
  .insert({
    name: pendingOrg.organization_name,
    owner_id: userId,
    is_trial: true, // ← ADD THIS
    trial_expires_at: new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000
    ).toISOString(), // ← ADD THIS (14 days)
  })
  .select()
  .single();
```

#### Change 2: Return trial status in response

**Location**: Line ~245 (final response)

**Current code**:

```typescript
return new Response(
  JSON.stringify({
    success: true,
    user: {
      id: userId,
      email: email,
      name: userName,
      emailConfirmed: emailConfirmed,
    },
    pendingOrganizationsProcessed: pendingOrganizationsProcessed,
    message: "Successfully signed in!",
  } as SignInResponse),
  {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  }
);
```

**Updated code**:

```typescript
// First, query organization to get trial status
let organizationInfo = null;
if (emailConfirmed) {
  const { data: orgMember } = await supabaseAdmin
    .from("organization_members")
    .select(
      "organization_id, organizations(id, name, is_trial, trial_expires_at)"
    )
    .eq("user_id", userId)
    .single();

  if (orgMember && orgMember.organizations) {
    const org = Array.isArray(orgMember.organizations)
      ? orgMember.organizations[0]
      : orgMember.organizations;

    organizationInfo = {
      id: org.id,
      name: org.name,
      isTrial: org.is_trial,
      trialExpiresAt: org.trial_expires_at,
      daysRemaining:
        org.is_trial && org.trial_expires_at
          ? Math.ceil(
              (new Date(org.trial_expires_at).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24)
            )
          : null,
    };
  }
}

return new Response(
  JSON.stringify({
    success: true,
    user: {
      id: userId,
      email: email,
      name: userName,
      emailConfirmed: emailConfirmed,
    },
    organization: organizationInfo, // ← ADD THIS
    pendingOrganizationsProcessed: pendingOrganizationsProcessed,
    message: "Successfully signed in!",
  } as SignInResponse),
  {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  }
);
```

#### Change 3: Update SignInResponse interface

**Location**: Line ~14 (top of file)

**Current code**:

```typescript
interface SignInResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    emailConfirmed: boolean;
  };
  pendingOrganizationsProcessed?: boolean;
  message?: string;
  error?: string;
}
```

**Updated code**:

```typescript
interface SignInResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    emailConfirmed: boolean;
  };
  organization?: {
    // ← ADD THIS
    id: string;
    name: string;
    isTrial: boolean;
    trialExpiresAt: string | null;
    daysRemaining: number | null;
  } | null;
  pendingOrganizationsProcessed?: boolean;
  message?: string;
  error?: string;
}
```

---

## 3. Paddle Webhook Function Updates

**File**: `supabase/functions/paddle-webhook/index.ts`

### Current Behavior:

- Verifies Paddle webhook signature
- Processes various Paddle events
- (Need to see current implementation to provide specific updates)

### Changes Needed:

#### Add handler for `transaction.completed` event

**This is where you create the license after successful payment.**

**Pseudocode for new handler**:

```typescript
// In the event handler switch/if statement
if (eventType === "transaction.completed") {
  const customData = body.data.custom_data; // Contains user_id, organization_id
  const transactionId = body.data.id;
  const quantity = body.data.details.line_items[0].quantity; // License count

  // 1. Insert into organization_licenses
  const { error: licenseError } = await supabaseAdmin
    .from("organization_licenses")
    .insert({
      organization_id: customData.organization_id,
      total_licenses: quantity,
      used_licenses: 1, // Owner already exists in organization_members
      license_type: "standard",
      expires_at: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(), // 1 year
      paddle_id: transactionId,
    });

  if (licenseError) {
    console.error("Failed to create license:", licenseError);
    return new Response("License creation failed", { status: 500 });
  }

  // 2. Update organization to mark as paid (not trial)
  const { error: orgError } = await supabaseAdmin
    .from("organizations")
    .update({ is_trial: false })
    .eq("id", customData.organization_id);

  if (orgError) {
    console.error("Failed to update organization:", orgError);
  }

  console.log(
    `License created for org ${customData.organization_id}: ${quantity} seats`
  );

  return new Response("OK", { status: 200 });
}
```

**Note**: I'll need to see the current paddle-webhook implementation to provide exact line numbers and context.

---

## Summary of Changes

| File                      | Changes                                                | Complexity      | Time      |
| ------------------------- | ------------------------------------------------------ | --------------- | --------- |
| `signup/index.ts`         | Add `user_id` to pending_organizations insert          | ⭐ Trivial      | 5 min     |
| `signin/index.ts`         | Add trial fields to org creation + return trial status | ⭐⭐ Easy       | 30-45 min |
| `paddle-webhook/index.ts` | Add transaction.completed handler for license creation | ⭐⭐⭐ Moderate | 45-60 min |

**Total Development Time**: ~1.5-2 hours for all three updates

---

## Testing Strategy

### After signup.ts update:

```sql
-- Check that user_id is being saved
SELECT * FROM pending_organizations WHERE user_id IS NOT NULL;
```

### After signin.ts update:

```sql
-- Check that new organizations have trial fields
SELECT id, name, is_trial, trial_expires_at
FROM organizations
WHERE is_trial = true;
```

### After paddle-webhook.ts update:

```sql
-- Check that license was created after test payment
SELECT * FROM organization_licenses WHERE organization_id = 'test-org-id';

-- Check that organization is no longer in trial
SELECT is_trial FROM organizations WHERE id = 'test-org-id';
```

---

## Next Steps

1. ✅ Run database migrations first (Phase 1)
2. Update `signup/index.ts` (5 minutes)
3. Update `signin/index.ts` (30-45 minutes)
4. Update `paddle-webhook/index.ts` (45-60 minutes)
5. Test each function after updates
6. Deploy to Supabase
7. Test end-to-end flow

**Important**: Test locally with `supabase functions serve` before deploying!
