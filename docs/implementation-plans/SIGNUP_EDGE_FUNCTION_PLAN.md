# Signup Edge Function Implementation Plan

## Overview

Create a Supabase Edge Function for user signup that matches the desktop app's authentication flow, using the service role key to bypass RLS policies.

## Desktop App Flow Analysis

### Key Components (C#)

**SupabaseAuthenticationService.cs**:

- Signs up user with `_supabaseClient.Auth.SignUp(email, password)`
- Returns `SupabaseAuthUser` with `EmailConfirmed` property
- Handles session persistence

**MainWindowViewModel.cs**:

- Calls `HandleNewUserOrganizationSetup(user, organizationName)`
- **If `user.EmailConfirmed` = true**: Calls `CreateOrganizationImmediately()`
- **If `user.EmailConfirmed` = false**: Calls `CreatePendingOrganization()`

**SupabaseManagementService.cs**:

- Uses **service role client** (`_serviceRoleClient`) for database operations
- `CreatePendingOrganizationAsync()`: Inserts into `pending_organizations` table
- `CreateOrganizationAsync()`: Creates organization with `owner_id`
- `UpsertUserProfileAsync()`: Creates/updates `user_profiles`
- `AddUserToOrganizationAsync()`: Adds to `organization_members`
- `ProcessPendingOrganizationsAsync()`: Processes pending orgs on signin

## Website Current Flow (JavaScript)

**auth.js** (Current - BROKEN):

- Uses anonymous key client
- Tries to insert into `user_profiles` → **RLS Error**
- Tries to create organization → **Might fail**

## New Edge Function Flow

### Function: `supabase/functions/signup/index.ts`

#### Inputs (POST request body):

```typescript
{
  email: string,
  password: string,
  name: string,
  organizationName?: string
}
```

#### Process Flow:

```
1. CREATE AUTH USER
   ↓
   Use Supabase Auth Admin API
   POST to auth.users

2. CHECK EMAIL CONFIRMATION STATUS
   ↓
   user.email_confirmed_at !== null

3a. IF EMAIL CONFIRMED:
    ├─ Create user_profiles entry (service role)
    ├─ Create organizations entry (service role)
    └─ Add to organization_members (service role)

3b. IF EMAIL NOT CONFIRMED:
    └─ Create pending_organizations entry (service role)

4. RETURN RESULT
   ↓
   {
     success: true,
     user: { id, email, name, emailConfirmed },
     requiresEmailConfirmation: boolean,
     message: string
   }
```

#### Database Operations (All use Service Role Key):

**user_profiles**:

```typescript
{
  id: user.id,
  email: email,
  name: name
}
```

**organizations**:

```typescript
{
  id: generated_uuid,
  name: organizationName,
  owner_id: user.id,
  created_at: now,
  updated_at: now
}
```

**organization_members**:

```typescript
{
  organization_id: org.id,
  user_id: user.id,
  role: 'owner'
}
```

**pending_organizations** (if email not confirmed):

```typescript
{
  user_email: email,
  user_name: name,
  organization_name: organizationName
}
```

## Sign-In Edge Function (Companion)

### Function: `supabase/functions/signin/index.ts`

When user signs in with confirmed email, check for pending organizations:

```
1. SIGN IN USER
   ↓
2. CHECK IF EMAIL CONFIRMED
   ↓
3. IF CONFIRMED: Process pending organizations
   ├─ Query pending_organizations by email
   ├─ Create organizations
   ├─ Create user_profiles if missing
   ├─ Add to organization_members
   └─ Delete pending_organizations entries
```

## Updated Website Flow

### auth.js Changes:

**signUp()**:

```javascript
async signUp(email, password, name, organizationName) {
    // Call Edge Function instead of direct Supabase insert
    const response = await fetch(
        `${SUPABASE_CONFIG.url}/functions/v1/signup`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_CONFIG.anonKey
            },
            body: JSON.stringify({ email, password, name, organizationName })
        }
    );

    const result = await response.json();

    if (result.success) {
        if (result.requiresEmailConfirmation) {
            return {
                success: true,
                message: 'Check your email to confirm your account'
            };
        } else {
            // Sign in the user
            return await this.signIn(email, password);
        }
    }

    return { success: false, error: result.error };
}
```

**signIn()**:

```javascript
async signIn(email, password) {
    // Call Edge Function that processes pending orgs
    const response = await fetch(
        `${SUPABASE_CONFIG.url}/functions/v1/signin`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_CONFIG.anonKey
            },
            body: JSON.stringify({ email, password })
        }
    );

    const result = await response.json();

    if (result.success) {
        // Session is handled by Supabase client
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email, password
        });

        return { success: true, user: data.user };
    }

    return { success: false, error: result.error };
}
```

## Environment Variables Required

- `SUPABASE_URL` ✅ (already set)
- `SUPABASE_SERVICE_ROLE_KEY` ✅ (already set)
- `SUPABASE_ANON_KEY` ✅ (already set)

## Testing Plan

1. **Test unconfirmed email signup**:

   - Sign up user
   - Verify `pending_organizations` entry created
   - Confirm email
   - Sign in
   - Verify organization created and pending deleted

2. **Test auto-confirmed email signup**:

   - Sign up user (with auto-confirm enabled)
   - Verify `user_profiles`, `organizations`, `organization_members` created immediately
   - No `pending_organizations` entry

3. **Test existing organization**:
   - Sign up with existing org name
   - Verify user added as member to existing org

## Migration from Current Code

1. Deploy `signup` Edge Function
2. Deploy `signin` Edge Function
3. Update `auth.js` to use Edge Functions
4. Test thoroughly
5. Remove old RLS policies if no longer needed

## Benefits of This Approach

✅ **Matches desktop app** - Identical flow and logic
✅ **Secure** - Service role key only on server
✅ **Handles both scenarios** - Confirmed and unconfirmed emails
✅ **Pending organization support** - Matches desktop app pattern
✅ **No RLS issues** - Bypasses RLS with service role key
