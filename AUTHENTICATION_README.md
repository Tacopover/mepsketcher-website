# User Authentication & License Management Branch

This branch adds user authentication and license management functionality to the MepSketcher website using Supabase as the backend.

## ✨ Features Added

### Authentication

- **Sign Up**: New user registration with email verification
- **Sign In**: Email/password authentication
- **Password Reset**: Forgot password functionality
- **Session Persistence**: Auto-login for returning users
- **Sign Out**: Secure logout

### Dashboard

- **User Profile**: Display user information and account details
- **License Management**: View all user licenses
- **License Actions**: Copy license keys, renew/extend licenses
- **Empty States**: Helpful prompts for new users

## 🔧 Technical Details

### Supabase Integration

The website connects to the same Supabase backend used by the MepSketcher desktop application:

- **URL**: `https://jskwfvwbhyltmxcdsbnm.supabase.co`
- **Authentication**: Uses Supabase Auth with email/password
- **Database Tables**:
  - `licenses` - Stores user license information
  - `user_profiles` - Extended user profile data (if needed)

### File Structure

```
mepsketcher-website/
├── login.html                  # Login/Signup page
├── dashboard.html              # User dashboard
├── css/
│   ├── auth.css               # Authentication styles
│   └── style.css              # Main styles (updated)
├── js/
│   ├── supabase-config.js     # Supabase configuration
│   ├── auth.js                # Authentication service
│   ├── login-page.js          # Login page interactions
│   └── dashboard.js           # Dashboard functionality
└── index.html                 # Homepage (updated with Sign In link)
```

## 📋 Database Schema Requirements

For full functionality, ensure these tables exist in your Supabase database.

### Core Tables (From MepSketcher Desktop App)

The website uses the **same tables** as the MepSketcher desktop application:

#### `organizations` table:

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view organizations they own or are members of
CREATE POLICY "Users can view their organizations"
    ON organizations FOR SELECT
    USING (
        auth.uid() = owner_id OR
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organizations.id
            AND organization_members.user_id = auth.uid()
        )
    );

-- Policy: Users can create organizations
CREATE POLICY "Users can create organizations"
    ON organizations FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- Policy: Owners can update their organizations
CREATE POLICY "Owners can update organizations"
    ON organizations FOR UPDATE
    USING (auth.uid() = owner_id);
```

#### `organization_members` table:

```sql
CREATE TABLE organization_members (
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view memberships in their organizations
CREATE POLICY "Users can view organization members"
    ON organization_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = organization_members.organization_id
            AND (organizations.owner_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM organization_members om
                     WHERE om.organization_id = organizations.id
                     AND om.user_id = auth.uid()
                     AND om.role = 'admin'
                 ))
        )
    );
```

#### `organization_licenses` table:

```sql
CREATE TABLE organization_licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    total_licenses INT NOT NULL DEFAULT 5,
    used_licenses INT NOT NULL DEFAULT 0,
    license_type TEXT NOT NULL DEFAULT 'starter',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE organization_licenses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view licenses for their organizations
CREATE POLICY "Users can view organization licenses"
    ON organization_licenses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = organization_licenses.organization_id
            AND (organizations.owner_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM organization_members
                     WHERE organization_members.organization_id = organizations.id
                     AND organization_members.user_id = auth.uid()
                 ))
        )
    );

-- Policy: Organization owners can manage licenses (for testing)
CREATE POLICY "Owners can manage licenses"
    ON organization_licenses FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = organization_licenses.organization_id
            AND organizations.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = organization_licenses.organization_id
            AND organizations.owner_id = auth.uid()
        )
    );
```

#### `user_profiles` table (optional, for extended user data):

```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    name TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read and update their own profile
CREATE POLICY "Users can view own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id);
```

    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
USING (auth.uid() = id);

```

## 🚀 Testing the Features

### 1. Test User Registration
1. Navigate to `login.html`
2. Click "Create Account" tab
3. Fill in name, email, and password
4. Check email for verification link

### 2. Test User Login
1. Navigate to `login.html`
2. Enter email and password
3. Click "Sign In"
4. Should redirect to `dashboard.html`

### 3. Test Dashboard
1. After logging in, view:
   - User profile information
   - License summary (will show 0 initially)
   - Empty state for licenses

### 4. **Test Dummy License Purchase** (NEW!)
1. On dashboard, click "Buy License" button
2. Enter number of licenses (e.g., 5)
3. Enter license type (starter, professional, or enterprise)
4. If you don't have an organization:
   - You'll be prompted to create one
   - Enter organization name
   - Organization will be created automatically
5. License will be created and displayed
6. Refresh to see updated license count

### 5. Test License Management
1. After creating a license, try:
   - **Add More Licenses**: Click "Add More Licenses" button on any active license
   - **Extend Expiry**: Click "Extend Expiry" to add months to expiration
   - **Renew License**: Click "Renew License" on expired licenses to extend by 1 year

### 6. Test Password Reset
1. On login page, click "Forgot password?"
2. Enter email address
3. Check email for reset link
   - License list (if you have test data)

### 4. Test Password Reset

1. On login page, click "Forgot password?"
2. Enter email address
3. Check email for reset link

## 🔐 Security Notes

### Current Setup:

- Uses Supabase's built-in authentication
- Row Level Security (RLS) policies protect user data
- Anon key is safe to expose (public key)
- Service role key should NEVER be in client-side code

### ⚠️ Important:

The `supabase-config.js` file currently contains your actual Supabase credentials. For production:

1. **Keep anon key** - This is safe to expose (it's public)
2. **Remove service role key** - This should only be on server-side
3. **Use environment variables** - For sensitive configuration

## 🛣️ Next Steps / TODO

### Current Phase: Testing & Validation ✅

- [x] Dummy license purchase (creates organization_licenses without payment)
- [x] Add more licenses to existing organization
- [x] Extend license expiration (custom months)
- [x] Renew expired licenses (+1 year)
- [ ] **Test Supabase connection end-to-end**
- [ ] **Verify RLS policies work correctly**
- [ ] **Test on multiple browsers**
- [ ] **Handle edge cases** (expired licenses, multiple orgs, etc.)

### Payment Integration (Phase 2)

- [ ] Integrate Stripe or Paddle for license purchases
- [ ] Add payment success/failure pages
- [ ] Create webhook handler for payment confirmation
- [ ] Replace dummy purchase with real payment flow
- [ ] Add invoice generation

### License Management Enhancements (Phase 2)

- [ ] Track license activations from desktop app
- [ ] Desktop app license validation endpoint
- [ ] License usage analytics
- [ ] Multi-organization support for users
- [ ] Organization member invitation system

### User Experience (Phase 2)

- [ ] Add loading spinners for async operations
- [ ] Improve error handling and user feedback
- [ ] Add email verification reminder
- [ ] Create profile update modal
- [ ] Add password change functionality

### Admin Dashboard (Future)

- [ ] Admin page to manage all users
- [ ] Admin page to manage all licenses
- [ ] Analytics and reporting
- [ ] Manual license generation

## 🧪 Manual Testing Checklist

### Basic Authentication
- [ ] Sign up with new email
- [ ] Verify email confirmation email is sent
- [ ] Sign in with verified account
- [ ] Check dashboard displays user info correctly
- [ ] Test password reset flow
- [ ] Test sign out functionality
- [ ] Test "Remember me" functionality
- [ ] Test mobile responsiveness

### Dummy License Purchase Flow
- [ ] Click "Buy License" button on dashboard
- [ ] Test organization creation (if no org exists)
- [ ] Successfully purchase first license (inserts record)
- [ ] Purchase additional licenses (updates existing record)
- [ ] Verify license displays with correct data:
  - Organization name
  - Total licenses count
  - Used licenses count
  - Available licenses
  - Expiration date
  - Status (active/expired)

### License Management Actions
- [ ] **Add More Licenses**: Increase total_licenses for existing record
- [ ] **Extend Expiry**: Add custom months to expires_at
- [ ] **Renew License**: Extend expires_at by 1 year from now
- [ ] Verify all actions update the organization_licenses table
- [ ] Check that changes persist after page refresh

### Edge Cases
- [ ] Test with no organization (should prompt creation)
- [ ] Test with expired license
- [ ] Test with multiple organizations (if applicable)
- [ ] Test invalid input (negative numbers, etc.)
- [ ] Test with no licenses available

## 📝 Notes

- The desktop app and website share the same Supabase authentication
- Users can log in to both with the same credentials
- License validation in the desktop app checks the `organization_licenses` table
- Organization-based licensing: Users can be members of multiple organizations
- Each organization has its own license pool (total_licenses, used_licenses)
- Desktop app assigns licenses when users activate

## 🐛 Known Issues / Limitations

### Current Implementation
1. **Dummy Purchase Only**: License purchase doesn't process payments yet (Phase 2)
2. **No Payment Gateway**: Skips payment integration for testing purposes
3. **Password Reset Page**: Redirects to `/reset-password.html` which doesn't exist yet
4. **Single Organization**: Users can only create one organization currently
5. **No Member Invitations**: Can't add other users to organization yet

### Testing Dependencies
1. **RLS Policies**: Must be set up in Supabase before testing
2. **Email Verification**: Required for full authentication flow
3. **Browser CORS**: Must access via proper domain (not file://)

### Desktop App Integration
1. **License Activation**: Desktop app must update `used_licenses` count
2. **License Validation**: Desktop app should check `expires_at` and `available licenses`
3. **Sync Logic**: Changes in website should reflect in desktop app and vice versa

## 🔄 Merging to Main

Before merging this branch to main:

1. ✅ Test all authentication flows
2. ✅ Ensure database tables are created
3. ✅ Verify RLS policies are in place
4. ✅ Test on multiple browsers
5. ⏳ Set up payment integration (or remove buy buttons temporarily)
6. ⏳ Add proper error handling

---

**Branch**: `feature/user-authentication`
**Created**: 2025-10-08
**Status**: 🚧 In Development
```
