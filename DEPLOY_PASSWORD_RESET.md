# Deploy Password Reset Edge Functions

## Current Issue

Getting 500 error when calling reset-password-request Edge Function. This is likely due to missing environment variables or the functions not being properly deployed.

## Deployment Steps

### Option 1: Deploy via Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/jskwfvwbhyltmxcdsbnm
   - Click on "Edge Functions" in the left sidebar

2. **Deploy reset-password-request Function**
   - Click "Create a new function" or "Deploy function"
   - Name: `reset-password-request`
   - Copy/paste the code from: `supabase/functions/reset-password-request/index.ts`
   - Click "Deploy"

3. **Deploy confirm-password-reset Function**
   - Click "Create a new function" or "Deploy function"
   - Name: `confirm-password-reset`
   - Copy/paste the code from: `supabase/functions/confirm-password-reset/index.ts`
   - Click "Deploy"

4. **Set Environment Variables** (CRITICAL)
   - Go to Project Settings > Edge Functions > Secrets
   - Add the following secrets:

   ```
   RESEND_API_KEY=re_your_resend_api_key_here
   SITE_URL=https://mepsketcher.com
   ```

   **To get your Resend API Key:**
   - Go to: https://resend.com/api-keys
   - Create a new API key if you don't have one
   - Copy the key (starts with `re_`)

5. **Verify Database Migration**
   - Go to: SQL Editor in Supabase Dashboard
   - Run the migration from: `supabase/migrations/20260203_password_reset_tokens.sql`
   - Check if the `password_reset_tokens` table exists

### Option 2: Deploy via Supabase CLI

If you want to install the Supabase CLI:

```powershell
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref jskwfvwbhyltmxcdsbnm

# Set environment variables (create .env file)
# Then deploy with secrets:
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set SITE_URL=https://mepsketcher.com

# Deploy functions
supabase functions deploy reset-password-request
supabase functions deploy confirm-password-reset

# Deploy database migration
supabase db push
```

## Testing After Deployment

1. **Check Edge Function Logs**
   - In Supabase Dashboard > Edge Functions
   - Click on `reset-password-request`
   - View "Logs" tab to see any errors

2. **Test Password Reset Flow**
   - Go to: https://mepsketcher.com/login.html
   - Click "Forgot Password"
   - Enter your email
   - Check for errors in browser console
   - Check Edge Function logs in Supabase Dashboard

3. **Verify Email Sent**
   - Check Resend Dashboard: https://resend.com/emails
   - Verify email was sent successfully

## Common Issues

### 500 Error - Missing Environment Variables

**Symptom:** Edge Function returns 500 error
**Solution:** Make sure `RESEND_API_KEY` and `SITE_URL` are set in Supabase Dashboard

### 500 Error - Database Table Missing

**Symptom:** Edge Function returns 500 error, logs show database error
**Solution:** Run the database migration to create `password_reset_tokens` table

### 401 Error - Missing Authorization

**Symptom:** Edge Function returns 401 error
**Solution:** Already fixed - Authorization header with anon key is now included

### Email Not Received

**Symptom:** No error, but email doesn't arrive
**Solution:**

- Check Resend Dashboard for email status
- Verify RESEND_API_KEY is correct
- Check spam folder

## Environment Variables Summary

| Variable         | Value                     | Where to Set                                             |
| ---------------- | ------------------------- | -------------------------------------------------------- |
| `RESEND_API_KEY` | `re_xxx...`               | Supabase Dashboard > Settings > Edge Functions > Secrets |
| `SITE_URL`       | `https://mepsketcher.com` | Supabase Dashboard > Settings > Edge Functions > Secrets |

## Next Steps After Deployment

1. ✅ Deploy both Edge Functions
2. ✅ Set environment variables
3. ✅ Run database migration
4. ✅ Test password reset flow
5. ✅ Check Resend Dashboard for email delivery

---

**Note:** The Edge Functions are already written and working. The 500 error is almost certainly due to missing environment variables or the functions not being deployed yet. Follow the steps above to complete the deployment.
