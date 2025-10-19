# Desktop App Signup/Signin Flow - Complete Analysis

## Summary

The MepSketcher desktop app uses a **dual-client approach** with Supabase:

1. **Anonymous Key Client** - For regular authenticated operations
2. **Service Role Key Client** - For bypassing RLS during signup/organization setup

## Detailed Flow Diagrams

### 📋 SIGNUP FLOW

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Sign Up" in MainWindow                         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ MainWindowViewModel.LoginAsync() called                     │
│ - IsSignUpMode = true                                        │
│ - Email, Password, Name, OrganizationName collected         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ SupabaseAuthenticationService.SignUpAsync()                 │
│ → await _supabaseClient.Auth.SignUp(email, password)        │
│ → Returns SupabaseAuthResult with User                      │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
                  ┌────┴────┐
                  │         │
        ┌─────────▼──┐   ┌──▼────────┐
        │ Email      │   │ Email     │
        │ CONFIRMED  │   │ NOT       │
        │            │   │ CONFIRMED │
        └─────┬──────┘   └──┬────────┘
              │             │
              ↓             ↓
   ┌──────────────────┐  ┌──────────────────────┐
   │ CreateOrg        │  │ CreatePending        │
   │ Immediately      │  │ Organization         │
   └────────┬─────────┘  └──────────┬───────────┘
            │                       │
            ↓                       ↓
```

### ✅ EMAIL CONFIRMED PATH

```
HandleNewUserOrganizationSetup(user, orgName)
  └─► user.EmailConfirmed = TRUE
       └─► CreateOrganizationImmediately()
            │
            ├─► 1. UpsertUserProfileAsync()
            │    └─► INSERT INTO user_profiles
            │         - id: user.id
            │         - email: user.email
            │         - name: user.name
            │
            ├─► 2. SearchOrganizationsByNameAsync(orgName)
            │    └─► SELECT * FROM organizations WHERE name = ?
            │
            ├─► IF organization exists:
            │    └─► AddUserToOrganizationAsync(org.id, user.id, "member")
            │         └─► INSERT INTO organization_members
            │
            └─► IF organization NOT exists:
                 ├─► CreateOrganizationAsync(orgName, user.id)
                 │    └─► INSERT INTO organizations
                 │         - id: new_uuid
                 │         - name: orgName
                 │         - owner_id: user.id
                 │
                 └─► AddUserToOrganizationAsync(org.id, user.id, "admin")
                      └─► INSERT INTO organization_members
                           - organization_id: org.id
                           - user_id: user.id
                           - role: "admin"
```

### ⏳ EMAIL NOT CONFIRMED PATH

```
HandleNewUserOrganizationSetup(user, orgName)
  └─► user.EmailConfirmed = FALSE
       └─► CreatePendingOrganization()
            │
            └─► CreatePendingOrganizationAsync()
                 └─► Using _serviceRoleClient
                      └─► INSERT INTO pending_organizations
                           - user_email: user.email
                           - user_name: user.name
                           - organization_name: orgName
                           - created_at: now
```

### 🔑 SIGNIN FLOW (After Email Confirmation)

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Sign In"                                        │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ SupabaseAuthenticationService.LoginAsync()                  │
│ → await _supabaseClient.Auth.SignIn(email, password)        │
│ → Returns session with confirmed user                       │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ ProcessPendingOrganizationsOnLogin(user)                    │
│ → IF user.EmailConfirmed = TRUE                             │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ ProcessPendingOrganizationsAsync(email, userId)             │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. SELECT * FROM pending_organizations WHERE email = ?      │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
         ┌─────────────┴─────────────┐
         │                           │
         ↓                           ↓
   ┌─────────────┐         ┌─────────────────┐
   │ Pending Orgs│         │ No Pending Orgs │
   │ Found       │         │ → Return true   │
   └──────┬──────┘         └─────────────────┘
          ↓
   FOR EACH pending_org:
          ↓
   ┌──────────────────────────────────┐
   │ SearchOrganizationsByNameAsync() │
   └──────┬───────────────────────────┘
          ↓
     ┌────┴────┐
     │         │
     ↓         ↓
┌─────────┐ ┌─────────┐
│ Org     │ │ Org NOT │
│ EXISTS  │ │ EXISTS  │
└────┬────┘ └────┬────┘
     │           │
     ↓           ↓
 AddUser    CreateOrg
 as Member  as Owner
     │           │
     └─────┬─────┘
           ↓
   ┌──────────────────┐
   │ DELETE FROM      │
   │ pending_orgs     │
   │ WHERE id = ?     │
   └──────────────────┘
```

## Key Implementation Details

### Service Role Client Usage

```csharp
// From SupabaseManagementService.cs
private readonly Supabase.Client _serviceRoleClient;

// Used for operations that bypass RLS:
await _serviceRoleClient
    .From<SupabaseUserProfile>()
    .Insert(profile);  // ← No RLS check!
```

### Authentication Client vs Service Role Client

| Operation                      | Client Used      | Reason              |
| ------------------------------ | ---------------- | ------------------- |
| `SignUp()`                     | Anonymous Key    | Creates auth user   |
| `SignIn()`                     | Anonymous Key    | Authenticates user  |
| Insert `user_profiles`         | **Service Role** | Bypass RLS          |
| Insert `organizations`         | **Service Role** | Bypass RLS          |
| Insert `organization_members`  | **Service Role** | Bypass RLS          |
| Insert `pending_organizations` | **Service Role** | No auth session yet |
| Query `pending_organizations`  | **Service Role** | Needs full access   |

### Email Confirmation Handling

```csharp
// From MainWindowViewModel.cs

// After signup:
if (result.RequiresEmailConfirmation)
{
    LoginMessage = "Please check your email to confirm your account before signing in.";
    return; // ← Stops here, waits for email confirmation
}

// After signin:
if (_supabaseManagementService != null && user.EmailConfirmed)
{
    await ProcessPendingOrganizationsAsync(user.Email, user.Id);
}
```

## Database Tables Affected

### Direct Inserts (Service Role):

1. `user_profiles` - User profile information
2. `organizations` - Organization details
3. `organization_members` - User-to-organization mappings
4. `pending_organizations` - Temporary storage for unconfirmed users

### Queries:

- `organizations` - Search by name
- `pending_organizations` - Find by email, delete after processing

## Error Handling

```csharp
// Graceful degradation if org setup fails:
catch (Exception ex)
{
    System.Diagnostics.Debug.WriteLine($"Error setting up organization: {ex.Message}");
    LoginMessage = "Account created, but organization setup failed. Please contact support.";
}
```

## Session Persistence

```csharp
// Custom session handler for "Remember Me":
private readonly WpfSupabaseSessionHandler _sessionHandler;

// On login:
_sessionHandler.SaveSession(session);

// On init:
var storedSession = _sessionHandler.LoadSession();
await _supabaseClient.Auth.SetSession(storedSession.AccessToken, storedSession.RefreshToken);

// On logout:
_sessionHandler.DestroySession();
```

## What The Website Needs To Match

1. ✅ **Create signup Edge Function** using service role key
2. ✅ **Create signin Edge Function** that processes pending orgs
3. ✅ **Handle email confirmation state** properly
4. ✅ **Use pending_organizations table** for unconfirmed users
5. ✅ **Match exact database operations** from desktop app
6. ✅ **Return same result structure** to JavaScript client

This ensures perfect parity between desktop and web signup flows!
