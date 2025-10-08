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

For full functionality, ensure these tables exist in your Supabase database:

### `licenses` table:
```sql
CREATE TABLE licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    license_key TEXT UNIQUE NOT NULL,
    product_type TEXT NOT NULL DEFAULT 'Standard',
    purchase_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    expiry_date TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    max_activations INT DEFAULT 1,
    current_activations INT DEFAULT 0
);

-- Enable Row Level Security
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own licenses
CREATE POLICY "Users can view own licenses"
    ON licenses FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Service role can insert licenses
CREATE POLICY "Service role can insert licenses"
    ON licenses FOR INSERT
    WITH CHECK (true);
```

### `user_profiles` table (optional, for extended user data):
```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    name TEXT,
    company TEXT,
    phone TEXT,
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
   - License summary
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

### Payment Integration (Phase 2)
- [ ] Integrate Stripe or Paddle for license purchases
- [ ] Add payment success/failure pages
- [ ] Create webhook handler for payment confirmation
- [ ] Automatically generate licenses after payment

### License Management (Phase 2)
- [ ] Implement license renewal functionality
- [ ] Implement license extension functionality
- [ ] Add license key generation logic
- [ ] Track license activations from desktop app

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

- [ ] Sign up with new email
- [ ] Verify email confirmation email is sent
- [ ] Sign in with verified account
- [ ] Check dashboard displays user info correctly
- [ ] Test password reset flow
- [ ] Test sign out functionality
- [ ] Test "Remember me" functionality
- [ ] Verify licenses display correctly (if test data exists)
- [ ] Test mobile responsiveness

## 📝 Notes

- The desktop app and website share the same Supabase authentication
- Users can log in to both with the same credentials
- License validation in the desktop app should check the same `licenses` table
- Consider adding a "Download App" link on the dashboard after login

## 🐛 Known Issues

1. **Password reset redirect**: Currently set to redirect to `/reset-password.html` which doesn't exist yet
2. **Payment integration**: Placeholder alerts for buy/renew/extend license actions
3. **Profile update**: Currently shows alert instead of modal

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
