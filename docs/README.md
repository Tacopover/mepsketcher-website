# MepSketcher Website Documentation

This folder contains all documentation for the MepSketcher website project.

## 📚 Documentation Index

### 🚀 Getting Started

- **[QUICK_START_GUIDE.md](QUICK_START_GUIDE.md)** - Start here! Quick reference for continuing development
- **[implementation-plans/PAYMENT_FLOW_TODO.md](implementation-plans/PAYMENT_FLOW_TODO.md)** - Main implementation checklist with progress tracking

### 🗄️ Database & Schema

- **[SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md)** - Complete database schema reference
- **[DATABASE_MIGRATIONS.sql](DATABASE_MIGRATIONS.sql)** - SQL migrations for setting up the database
- **[DATABASE_FIX_SUMMARY.md](DATABASE_FIX_SUMMARY.md)** - Summary of database fixes applied

### 🔐 Authentication & Setup

- **[AUTHENTICATION_README.md](AUTHENTICATION_README.md)** - Authentication system setup and configuration
- **[CONFIG_SETUP.md](CONFIG_SETUP.md)** - Configuration guide for environment setup

### 📋 Implementation Plans (Detailed)

Located in `implementation-plans/` folder:

#### Primary Plans

- **[PAYMENT_FLOW_TODO.md](implementation-plans/PAYMENT_FLOW_TODO.md)** - Main checklist with current progress ⭐
- **[PAYMENT_FLOW_IMPLEMENTATION_PLAN.md](implementation-plans/PAYMENT_FLOW_IMPLEMENTATION_PLAN.md)** - Detailed specifications
- **[PAYMENT_FLOW_VISUAL.md](implementation-plans/PAYMENT_FLOW_VISUAL.md)** - Visual flow diagrams

#### Edge Function Documentation

- **[EDGE_FUNCTION_UPDATES.md](implementation-plans/EDGE_FUNCTION_UPDATES.md)** - Code changes for edge functions
- **[EDGE_FUNCTIONS_IMPLEMENTATION.md](implementation-plans/EDGE_FUNCTIONS_IMPLEMENTATION.md)** - Implementation details
- **[EDGE_FUNCTIONS_COMPLETE.md](implementation-plans/EDGE_FUNCTIONS_COMPLETE.md)** - Completion summary
- **[SIGNUP_EDGE_FUNCTION_PLAN.md](implementation-plans/SIGNUP_EDGE_FUNCTION_PLAN.md)** - Signup function plan

#### Supporting Documents

- **[IMPLEMENTATION_SUMMARY.md](implementation-plans/IMPLEMENTATION_SUMMARY.md)** - Overview of decisions made

### 🎨 UI & Dashboard

- **[DASHBOARD_IMPROVEMENTS.md](DASHBOARD_IMPROVEMENTS.md)** - Dashboard enhancement plans
- **[DASHBOARD_QUICK_REFERENCE.md](DASHBOARD_QUICK_REFERENCE.md)** - Quick reference for dashboard features

### 🔍 Analysis & Reference

- **[DESKTOP_APP_FLOW_ANALYSIS.md](DESKTOP_APP_FLOW_ANALYSIS.md)** - Analysis of desktop app user flows
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Testing procedures and guidelines

---

## 🎯 Where to Start

### For New Developers:

1. Read [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md)
2. Review [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md)
3. Check [implementation-plans/PAYMENT_FLOW_TODO.md](implementation-plans/PAYMENT_FLOW_TODO.md) for current progress

### For Continuing Development:

1. Open [implementation-plans/PAYMENT_FLOW_TODO.md](implementation-plans/PAYMENT_FLOW_TODO.md)
2. Find the next uncompleted phase
3. Refer to detailed specs in [PAYMENT_FLOW_IMPLEMENTATION_PLAN.md](implementation-plans/PAYMENT_FLOW_IMPLEMENTATION_PLAN.md) if needed

### For Troubleshooting:

1. Check [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) - Troubleshooting section
2. Review relevant implementation plan for lessons learned
3. Check database schema for RLS policies and constraints

---

## 📊 Current Project Status

**Backend**: ✅ Complete and tested

- Database schema with trial tracking
- Signup/signin edge functions with trial logic
- Paddle webhook processing license creation
- Full payment flow verified working

**Frontend**: 🔄 In Progress

- Phases 6-12 remaining
- Focus: Trial UI, pricing page, expiry enforcement

**Estimated Time to MVP**: 13-19 hours

---

## 🔧 Critical Configuration Notes

### Paddle Webhook Deployment

⚠️ **ALWAYS** deploy the paddle-webhook function with:

```powershell
npx supabase functions deploy paddle-webhook --no-verify-jwt
```

Standard deployment re-enables JWT verification, which blocks Paddle's webhook calls.

### Database Constraints

- Role in `organization_members` must be 'admin' or 'member' (NOT 'owner')
- RLS policies should not use functions with `auth.uid()` when service role is involved
- Check constraints are evaluated before RLS policies

---

## 📝 Documentation Maintenance

When making significant changes:

1. Update [PAYMENT_FLOW_TODO.md](implementation-plans/PAYMENT_FLOW_TODO.md) with progress
2. Add lessons learned to relevant plan
3. Update [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) if deployment process changes
4. Keep this index updated with new documents

---

Last Updated: October 19, 2025
