# Quick Start Guide - Payment Flow Implementation

## 🎉 Current Status: Backend Complete!

**✅ What's Working:**

- Database schema with trial tracking
- Signup → Email confirmation flow
- Signin with trial organization creation
- Paddle payment integration
- Webhook processing and license creation
- Full payment flow tested and verified

**🔄 What's Next:**

- Frontend trial UI (banner, countdown)
- Trial expiry enforcement
- Pricing page refinement

---

## ⚡ Quick Reference

### Completed Phases (1-5):

1. ✅ Database migrations
2. ✅ Signup function (with user_id in pending_organizations)
3. ✅ Signin function (with trial logic)
4. ✅ Paddle webhook (license creation working)
5. ✅ Frontend Paddle integration (organizationId passing)

### Next Steps (Phases 6-12):

6. 🔄 Frontend login integration (handle trial response)
7. 🔄 Dashboard trial UI
8. 🔄 Pricing page
9. 🔄 Trial expiry enforcement
10. 🔄 Testing
11. 🔄 Documentation
12. 🔄 Production monitoring

---

## 🚨 Critical: Deploying Paddle Webhook

The `paddle-webhook` function requires special configuration to accept external webhook calls from Paddle.

### Method 1: Config File (Recommended but not working reliably)

Create `supabase/functions/paddle-webhook/config.toml`:

```toml
[function]
verify_jwt = false
```

### Method 2: Deployment Flag (USE THIS)

**Always deploy paddle-webhook with this command:**

```powershell
npx supabase functions deploy paddle-webhook --no-verify-jwt
```

⚠️ **IMPORTANT**: Standard deployment re-enables JWT verification. Always use `--no-verify-jwt` flag!

### Why This Is Needed

- Paddle sends webhook requests without Supabase JWT tokens
- Paddle uses its own signature verification (`paddle-signature` header)
- If JWT verification is enabled, Supabase blocks the request with "Missing authorization header"
- Only disable JWT for paddle-webhook - keep it enabled for signup/signin functions

---

## 📁 Documentation Structure

All implementation plans are now in `docs/implementation-plans/`:

- **PAYMENT_FLOW_TODO.md** - Main checklist (START HERE)
- **PAYMENT_FLOW_IMPLEMENTATION_PLAN.md** - Detailed specifications
- **PAYMENT_FLOW_VISUAL.md** - Flow diagrams
- **EDGE_FUNCTION_UPDATES.md** - Code change details
- **IMPLEMENTATION_SUMMARY.md** - Overview and decisions

Database and architecture docs remain in root:

- **DATABASE_MIGRATIONS.sql** - SQL to run
- **SUPABASE_SCHEMA.md** - Schema reference

---

## 🎯 Next Development Session

### Start Here (30 min - 1 hr):

**Phase 6: Update Login Handler**

File: `js/login-page.js` or `js/auth.js`

1. Parse trial info from signin response:

   ```javascript
   const { organization } = signInResult;
   if (organization) {
     localStorage.setItem("orgId", organization.id);
     localStorage.setItem("isTrial", organization.isTrial);
     localStorage.setItem("trialExpiresAt", organization.trialExpiresAt);
     localStorage.setItem("trialDaysRemaining", organization.daysRemaining);
   }
   ```

2. Redirect to dashboard
3. Test with trial user

### Then (3-4 hrs):

**Phase 7: Dashboard Trial Banner**

File: `js/dashboard.js` and `dashboard.html`

1. Check trial status on load
2. Display banner if `isTrial === true`
3. Show days remaining countdown
4. Add "Upgrade" button linking to pricing
5. Style banner prominently
6. Test visibility with trial/paid users

---

## 🔧 Key Fixes Applied

### 1. Missing organizationId in Paddle Custom Data

**Problem**: Webhook couldn't find organization  
**Fix**: Query user's organization before opening Paddle checkout and pass in custom_data

### 2. Role Constraint Violation

**Problem**: Database rejected role='owner'  
**Fix**: Changed to role='admin' (matches check constraint)

### 3. RLS "Permission Denied for Schema auth"

**Problem**: RLS policies called functions with auth.uid(), service role had no auth context  
**Fix**: Made checks inline in policies instead of using functions

### 4. JWT Verification Blocking Webhook

**Problem**: Supabase blocked Paddle's requests  
**Fix**: Deploy with `--no-verify-jwt` flag (see above)

### 5. Signature Verification

**Problem**: Paddle signature format misunderstood  
**Fix**: Implemented proper ts:body format for Paddle v2

---

## 📚 Additional Resources

- **Paddle Dashboard**: Configure webhooks, test sandbox
- **Supabase Dashboard**: View edge function logs, test SQL
- **Browser DevTools**: Check console logs during payment flow

---

## 🐛 Troubleshooting

### Webhook Returns 401

**Symptom**: Paddle shows "Missing authorization header" or "Unauthorized"

**Solution**:

1. Check if JWT verification is enabled in Supabase Dashboard
2. Redeploy with: `npx supabase functions deploy paddle-webhook --no-verify-jwt`

### Rows Not Created After Payment

**Symptom**: Payment succeeds but no license in database

**Checklist**:

1. Check Supabase edge function logs for errors
2. Verify RLS policies don't block service role
3. Check role value ('admin' not 'owner')
4. Verify organizationId is in Paddle custom_data

### Can't Test Locally

**Note**: Paddle webhooks require public HTTPS URLs. Test in Supabase cloud, not locally.

---

## ⏱️ Time Estimates

| Remaining Phase             | Time Estimate |
| --------------------------- | ------------- |
| Phase 6: Login integration  | 30 min - 1 hr |
| Phase 7: Trial UI           | 3-4 hrs       |
| Phase 8: Pricing page       | 3-4 hrs       |
| Phase 9: Expiry enforcement | 2-3 hrs       |
| Phase 10: Testing           | 3-4 hrs       |
| Phase 11: Documentation     | 1 hr          |
| Phase 12: Monitoring        | 1-2 hrs       |
| **Total Remaining**         | **13-19 hrs** |

---

## 🎓 What We Learned

1. **Edge function config persistence**: config.toml doesn't always work - use deployment flags
2. **RLS with service roles**: Can't use auth.uid() in subqueries when service role is making the request
3. **Database constraints**: Check constraints are verified before RLS policies
4. **Paddle webhook format**: Must parse ts and h1 from signature header, verify with ts:body payload
5. **Custom data is critical**: organizationId must flow from frontend → Paddle → webhook

---

## 🚀 Ready to Continue?

Open `docs/implementation-plans/PAYMENT_FLOW_TODO.md` and start with Phase 6!

The backend is solid and tested - now it's just frontend polish and UX. You've got this! 💪
