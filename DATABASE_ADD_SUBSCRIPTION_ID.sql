-- Migration: Add subscription tracking to organization_licenses
-- This allows us to use Paddle's native multi-item subscriptions instead of creating custom prices

-- Add subscription_id column to track which Paddle subscription owns the licenses
ALTER TABLE organization_licenses
ADD COLUMN IF NOT EXISTS subscription_id text;

-- Add comment
COMMENT ON COLUMN organization_licenses.subscription_id IS 'Paddle subscription ID - tracks which subscription these licenses are part of. Enables multi-item subscription management.';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_organization_licenses_subscription_id
ON organization_licenses(subscription_id);
