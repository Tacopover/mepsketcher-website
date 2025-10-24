#!/usr/bin/env bash

# Edge Function Deployment Test Script
# This script helps you deploy and test the set-org-claims Edge Function

set -e  # Exit on error

echo "======================================"
echo "Edge Function Deployment & Test"
echo "======================================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found"
    echo ""
    echo "Install it with:"
    echo "  npm install -g supabase"
    echo ""
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check if logged in
echo "Checking login status..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase"
    echo ""
    echo "Login with:"
    echo "  supabase login"
    echo ""
    exit 1
fi

echo "✅ Logged in to Supabase"
echo ""

# Check if linked to project
echo "Checking project link..."
if [ ! -f ".supabase/config.toml" ]; then
    echo "❌ Not linked to a Supabase project"
    echo ""
    echo "Link your project with:"
    echo "  supabase link --project-ref YOUR_PROJECT_REF"
    echo ""
    echo "Find your project ref in: Supabase Dashboard > Settings > General > Reference ID"
    echo ""
    exit 1
fi

echo "✅ Linked to Supabase project"
echo ""

# Deploy function
echo "Deploying set-org-claims function..."
echo ""

if supabase functions deploy set-org-claims; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
else
    echo ""
    echo "❌ Function deployment failed"
    echo ""
    exit 1
fi

# List functions to verify
echo "Verifying deployment..."
echo ""
supabase functions list
echo ""

echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Open test-jwt-claims.html in your browser"
echo "2. Login to your app"
echo "3. Click '5. Call Edge Function'"
echo "4. Verify claims are set"
echo ""
echo "Or test via browser console:"
echo "  import { JWTClaimsHelper } from './js/jwt-claims-helper.js';"
echo "  const helper = new JWTClaimsHelper(supabase);"
echo "  await helper.setOrgClaims();"
echo ""
echo "View logs with:"
echo "  supabase functions logs set-org-claims --follow"
echo ""
