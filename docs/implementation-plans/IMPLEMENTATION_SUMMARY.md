# Payment Flow Implementation - Quick Summary

## What We're Building

A complete signup → trial → payment flow for the MepSketcher website with Paddle integration.

## Key Features

✅ **14-Day Free Trial** - All features with PDF watermark  
✅ **Immediate Access** - Users can use app right after signup/email confirmation  
✅ **Single License Type** - One "standard" license only (no tiers)  
✅ **Paddle Payment** - Integration with existing Paddle setup  
✅ **Trial Expiry Enforcement** - Block access after trial ends

## User Journey

```
Sign Up → Confirm Email → First Login → Trial Dashboard → Upgrade → Paid Access
  ↓           ↓              ↓              ↓                ↓           ↓
 auth.      email         creates      14 days free      Paddle    removes
 users    confirmed       org +         with all        payment    trial &
created               member table   features +                  watermark
                                     watermark
```

## Database Changes Required

### 1. organizations table

- Add `is_trial` (boolean, default: true)
- Add `trial_expires_at` (timestamp, default: NOW() + 14 days)

### 2. pending_organizations table

- Add `user_id` (text, nullable, references auth.users)

### 3. organization_licenses table

- Add `trial_expires_at` (timestamp, nullable)
- Change `used_licenses` default from 0 to 1

## Files Created/Modified

### New Files (6):

1. `PAYMENT_FLOW_IMPLEMENTATION_PLAN.md` - Detailed implementation plan
2. `PAYMENT_FLOW_TODO.md` - Checklist for tracking progress
3. `DATABASE_MIGRATIONS.sql` - SQL migrations to run
4. `IMPLEMENTATION_SUMMARY.md` - This file
5. `supabase/functions/process-first-login/index.ts` - New edge function
6. `pricing.html` + `js/paddle-checkout.js` - Checkout page

### Modified Files (5):

1. `SUPABASE_SCHEMA.md` - Updated with new columns
2. `supabase/functions/signup/index.ts` - Add user_profiles + pending_orgs
3. `supabase/functions/paddle-webhook/index.ts` - Add license creation
4. `js/auth.js` or `js/login-page.js` - Call process-first-login
5. `js/dashboard.js` - Add trial banner and restrictions

## Implementation Phases

| Phase | Description                | Time    | Status         |
| ----- | -------------------------- | ------- | -------------- |
| 1     | Database Schema Updates    | 30 min  | ⬜ Not Started |
| 2     | Signup Edge Function       | 1-2 hrs | ⬜ Not Started |
| 3     | First Login Edge Function  | 2-3 hrs | ⬜ Not Started |
| 4     | Frontend Login Integration | 1-2 hrs | ⬜ Not Started |
| 5     | Dashboard Trial UI         | 3-4 hrs | ⬜ Not Started |
| 6     | Paddle Webhook Handler     | 2-3 hrs | ⬜ Not Started |
| 7     | Pricing & Checkout Page    | 3-4 hrs | ⬜ Not Started |
| 8     | Trial Expiry Enforcement   | 2-3 hrs | ⬜ Not Started |
| 9     | Testing & Validation       | 3-4 hrs | ⬜ Not Started |

**Total Estimated Time**: 20-30 hours

## Getting Started

### Step 1: Run Database Migrations

```sql
-- Open Supabase SQL Editor and run:
-- See DATABASE_MIGRATIONS.sql
```

### Step 2: Verify Schema

- Check `organizations` table has `is_trial` and `trial_expires_at` columns
- Check `pending_organizations` table has `user_id` column
- Run verification queries at end of migration file

### Step 3: Start Implementation

- Follow `PAYMENT_FLOW_TODO.md` checklist
- Complete each phase in order
- Check off items as you go

## Testing Strategy

### Manual Testing Flow:

1. Sign up new user
2. Confirm email
3. Login (should create org)
4. Check trial banner shows
5. Export PDF (should have watermark)
6. Navigate to pricing
7. Complete Paddle checkout (sandbox)
8. Verify webhook creates license
9. Login again (should show paid status)
10. Export PDF (no watermark)

### Edge Cases to Test:

- Trial expiry while logged in
- Payment before trial ends
- Payment after trial expires
- Network failures during checkout
- Duplicate organization attempts
- Invalid Paddle webhooks

## Key Implementation Notes

### ⚠️ Critical Rules:

1. **Organization created on FIRST LOGIN** (not after payment)
2. **License table entry ONLY after payment** (trial users don't have license entry)
3. **Owner counts as used_license = 1** (when license created)
4. **Trial banner must be prominent** (users should know it's trial)
5. **PDF watermark required** (trial version indicator)

### 🔒 Security Considerations:

- Verify Paddle webhook signatures
- Use service role key for edge functions
- Validate organization ownership before operations
- Prevent duplicate pending organizations
- Add RLS policies if needed

### 🎯 Success Criteria:

✅ User can complete full flow: signup → trial → payment  
✅ No orphaned records in database  
✅ Trial period enforced correctly  
✅ Payment creates valid license  
✅ Paddle webhooks process successfully  
✅ PDF watermark appears/disappears correctly

## Paddle Integration Details

### Custom Data to Pass:

```javascript
{
  user_id: "uuid-of-user",
  organization_id: "uuid-of-org",
  user_email: "user@example.com"
}
```

### Webhook Events:

- `transaction.completed` - Handle payment success
- `subscription.updated` - Future: handle upgrades
- `subscription.canceled` - Future: handle cancellations

### Paddle Products:

- Single product with quantity selector
- Price per license seat
- 1-year subscription

## Environment Variables

### Required for Edge Functions:

```env
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PADDLE_WEBHOOK_SECRET=your-paddle-webhook-secret
```

### Required for Frontend:

```env
PADDLE_VENDOR_ID=your-paddle-vendor-id
PADDLE_PRODUCT_ID=your-paddle-product-id
PADDLE_ENVIRONMENT=sandbox # or production
```

## Support & Documentation

- **Detailed Plan**: See `PAYMENT_FLOW_IMPLEMENTATION_PLAN.md`
- **TODO Checklist**: See `PAYMENT_FLOW_TODO.md`
- **Schema Reference**: See `SUPABASE_SCHEMA.md`
- **Database Migrations**: See `DATABASE_MIGRATIONS.sql`

## Questions or Issues?

If you encounter issues during implementation:

1. Check the detailed plan for specifics
2. Review the schema documentation
3. Test each phase independently
4. Use Supabase logs for debugging
5. Test with Paddle sandbox first

## Future Enhancements (Post-MVP)

These features are NOT part of the initial implementation:

- ⏭️ Team member invitations
- ⏭️ License renewals handling
- ⏭️ Plan upgrades/downgrades
- ⏭️ Multiple organizations per user
- ⏭️ Trial expiry email notifications
- ⏭️ Admin dashboard for license management

---

**Ready to start?** Begin with Phase 1 in `PAYMENT_FLOW_TODO.md`
