# Edge Function Deployment Test Script (PowerShell)
# This script helps you deploy and test the set-org-claims Edge Function

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Edge Function Deployment & Test" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "Checking for Supabase CLI..." -ForegroundColor Yellow
try {
    $null = Get-Command supabase -ErrorAction Stop
    Write-Host "✅ Supabase CLI found" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Supabase CLI not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it with:" -ForegroundColor Yellow
    Write-Host "  npm install -g supabase" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Check if logged in
Write-Host "Checking login status..." -ForegroundColor Yellow
try {
    $null = supabase projects list 2>&1
    Write-Host "✅ Logged in to Supabase" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Not logged in to Supabase" -ForegroundColor Red
    Write-Host ""
    Write-Host "Login with:" -ForegroundColor Yellow
    Write-Host "  supabase login" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Check if linked to project
Write-Host "Checking project link..." -ForegroundColor Yellow
if (!(Test-Path "supabase\config.toml")) {
    Write-Host "❌ Not linked to a Supabase project" -ForegroundColor Red
    Write-Host ""
    Write-Host "Link your project with:" -ForegroundColor Yellow
    Write-Host "  supabase link --project-ref YOUR_PROJECT_REF" -ForegroundColor White
    Write-Host ""
    Write-Host "Find your project ref in: Supabase Dashboard > Settings > General > Reference ID" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "✅ Linked to Supabase project" -ForegroundColor Green
Write-Host ""

# Deploy function
Write-Host "Deploying set-org-claims function..." -ForegroundColor Yellow
Write-Host ""

try {
    supabase functions deploy set-org-claims
    Write-Host ""
    Write-Host "✅ Function deployed successfully!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "❌ Function deployment failed" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# List functions to verify
Write-Host "Verifying deployment..." -ForegroundColor Yellow
Write-Host ""
supabase functions list
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open test-jwt-claims.html in your browser" -ForegroundColor White
Write-Host "2. Login to your app" -ForegroundColor White
Write-Host "3. Click '5. Call Edge Function'" -ForegroundColor White
Write-Host "4. Verify claims are set" -ForegroundColor White
Write-Host ""
Write-Host "Or test via browser console:" -ForegroundColor Yellow
Write-Host "  import { JWTClaimsHelper } from './js/jwt-claims-helper.js';" -ForegroundColor White
Write-Host "  const helper = new JWTClaimsHelper(supabase);" -ForegroundColor White
Write-Host "  await helper.setOrgClaims();" -ForegroundColor White
Write-Host ""
Write-Host "View logs with:" -ForegroundColor Yellow
Write-Host "  supabase functions logs set-org-claims --follow" -ForegroundColor White
Write-Host ""
