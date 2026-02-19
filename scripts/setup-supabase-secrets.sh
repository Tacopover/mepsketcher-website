#!/bin/bash
# Supabase Secrets Setup Script
# This script helps you easily set up and manage secrets for both sandbox and production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Function to prompt for input
read_secret() {
    local prompt=$1
    local value
    read -sp "Enter $prompt: " value
    echo
    echo "$value"
}

# Check if Supabase CLI is installed
check_supabase_cli() {
    if ! command -v supabase &> /dev/null; then
        print_error "Supabase CLI not found. Please install it first:"
        echo "npm install -g supabase"
        exit 1
    fi
    print_success "Supabase CLI found"
}

# Function to set sandbox secrets
setup_sandbox_secrets() {
    print_header "Setting Up Sandbox (Development) Secrets"
    
    echo "You'll need these from Paddle Sandbox Dashboard:"
    echo "  1. Webhook Signing Secret (Settings > Webhooks)"
    echo "  2. Secret API Key (Developer Tools > API keys)"
    echo "  3. Product ID (from Products page)"
    echo ""
    
    local webhook_secret=$(read_secret "Paddle Webhook Secret (whsec_...)")
    local api_key=$(read_secret "Paddle API Key (sk_test_...)")
    local product_id=$(read_secret "Paddle Product ID (pro_...)")
    local site_url=$(read_secret "Site URL (default: http://localhost:8000) [leave blank for default]")
    
    site_url=${site_url:-"http://localhost:8000"}
    
    print_header "Applying Secrets to Development Environment"
    
    supabase secrets set --env-name development PADDLE_WEBHOOK_SECRET="$webhook_secret" && print_success "PADDLE_WEBHOOK_SECRET set"
    supabase secrets set --env-name development PADDLE_API_KEY="$api_key" && print_success "PADDLE_API_KEY set"
    supabase secrets set --env-name development PADDLE_ENVIRONMENT="sandbox" && print_success "PADDLE_ENVIRONMENT set to sandbox"
    supabase secrets set --env-name development PADDLE_PRODUCT_ID="$product_id" && print_success "PADDLE_PRODUCT_ID set"
    supabase secrets set --env-name development SITE_URL="$site_url" && print_success "SITE_URL set to $site_url"
    
    print_success "Sandbox secrets configured!"
}

# Function to set production secrets
setup_production_secrets() {
    print_header "Setting Up Production Secrets"
    
    echo "You'll need these from Paddle Production Dashboard:"
    echo "  1. Webhook Signing Secret (Settings > Webhooks)"
    echo "  2. Secret API Key (Developer Tools > API keys)"
    echo "  3. Product ID (from Products page)"
    echo ""
    
    local webhook_secret=$(read_secret "Paddle Webhook Secret (whsec_...)")
    local api_key=$(read_secret "Paddle API Key (sk_live_...)")
    local product_id=$(read_secret "Paddle Product ID (pro_...)")
    local site_url=$(read_secret "Site URL (default: https://mepsketcher.com) [leave blank for default]")
    
    site_url=${site_url:-"https://mepsketcher.com"}
    
    # Warn about production
    echo ""
    print_warning "This will update PRODUCTION secrets. Are you sure? (yes/no)"
    read confirmation
    
    if [ "$confirmation" != "yes" ]; then
        print_error "Cancelled. No changes made."
        return
    fi
    
    print_header "Applying Secrets to Production Environment"
    
    supabase secrets set --env-name production PADDLE_WEBHOOK_SECRET="$webhook_secret" && print_success "PADDLE_WEBHOOK_SECRET set"
    supabase secrets set --env-name production PADDLE_API_KEY="$api_key" && print_success "PADDLE_API_KEY set"
    supabase secrets set --env-name production PADDLE_ENVIRONMENT="production" && print_success "PADDLE_ENVIRONMENT set to production"
    supabase secrets set --env-name production PADDLE_PRODUCT_ID="$product_id" && print_success "PADDLE_PRODUCT_ID set"
    supabase secrets set --env-name production SITE_URL="$site_url" && print_success "SITE_URL set to $site_url"
    
    print_success "Production secrets configured!"
}

# Function to list secrets
list_secrets() {
    print_header "Listing All Secrets"
    
    echo -e "${BLUE}Development (Sandbox) Secrets:${NC}"
    supabase secrets list --env-name development 2>/dev/null || echo "No secrets set"
    
    echo ""
    echo -e "${BLUE}Production Secrets:${NC}"
    supabase secrets list --env-name production 2>/dev/null || echo "No secrets set"
}

# Function to rotate a secret
rotate_secret() {
    local env=$1
    local secret_name=$2
    local secret_value=$(read_secret "New value for $secret_name")
    
    supabase secrets set --env-name "$env" "$secret_name"="$secret_value"
    print_success "$secret_name rotated in $env environment"
}

# Main menu
show_menu() {
    echo ""
    echo -e "${BLUE}Supabase Secrets Management${NC}"
    echo "1. Setup sandbox (development) secrets"
    echo "2. Setup production secrets"
    echo "3. List all secrets"
    echo "4. Rotate a secret"
    echo "5. Exit"
    echo ""
    read -p "Choose an option (1-5): " choice
}

# Main script
main() {
    print_header "Supabase Secrets Management Tool"
    
    check_supabase_cli
    
    while true; do
        show_menu
        
        case $choice in
            1)
                setup_sandbox_secrets
                ;;
            2)
                setup_production_secrets
                ;;
            3)
                list_secrets
                ;;
            4)
                print_header "Rotate a Secret"
                read -p "Environment (development/production): " env
                read -p "Secret name (e.g., PADDLE_API_KEY): " secret
                rotate_secret "$env" "$secret"
                ;;
            5)
                print_success "Goodbye!"
                exit 0
                ;;
            *)
                print_error "Invalid option. Please choose 1-5."
                ;;
        esac
    done
}

# Run main function
main
