-- Database Migrations for Payment Flow Implementation
-- Run these migrations in your Supabase SQL Editor
-- Date: 2025-10-18

-- ============================================================================
-- MIGRATION 1: Add trial tracking to organizations table
-- ============================================================================

-- Add is_trial column (defaults to true for new organizations)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT true;

-- Add trial_expires_at column (defaults to 14 days from creation)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS trial_expires_at timestamp with time zone DEFAULT (NOW() + INTERVAL '14 days');

-- Add index for trial expiry lookups (only indexes rows where is_trial = true)
CREATE INDEX IF NOT EXISTS idx_organizations_trial_expires 
ON organizations(trial_expires_at) 
WHERE is_trial = true;

-- Add comment
COMMENT ON COLUMN organizations.is_trial IS 'Whether organization is in trial mode (before payment)';
COMMENT ON COLUMN organizations.trial_expires_at IS 'When the trial period expires (14 days from first login)';


-- ============================================================================
-- MIGRATION 2: Add user_id to pending_organizations table
-- ============================================================================

-- Add user_id column (nullable because it might be created before user signup)
ALTER TABLE pending_organizations
ADD COLUMN IF NOT EXISTS user_id text REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_organizations_user_id 
ON pending_organizations(user_id);

CREATE INDEX IF NOT EXISTS idx_pending_organizations_user_email 
ON pending_organizations(user_email);

-- Add comment
COMMENT ON COLUMN pending_organizations.user_id IS 'User ID populated after signup, before first login';


-- ============================================================================
-- MIGRATION 3: Update organization_licenses table
-- ============================================================================

-- Add trial_expires_at column for historical tracking (optional)
ALTER TABLE organization_licenses
ADD COLUMN IF NOT EXISTS trial_expires_at timestamp with time zone;

-- Update default for used_licenses (should start at 1 when created, since owner already exists)
ALTER TABLE organization_licenses
ALTER COLUMN used_licenses SET DEFAULT 1;

-- Add comment
COMMENT ON COLUMN organization_licenses.trial_expires_at IS 'Original trial expiry date (for historical tracking, optional)';
COMMENT ON COLUMN organization_licenses.used_licenses IS 'Number of licenses in use. Starts at 1 (owner) when created after payment.';


-- ============================================================================
-- MIGRATION 4: Create helper functions
-- ============================================================================

-- Function to check if organization trial has expired
CREATE OR REPLACE FUNCTION is_trial_expired(org_id text)
RETURNS boolean AS $$
DECLARE
  org_record RECORD;
BEGIN
  SELECT is_trial, trial_expires_at INTO org_record
  FROM organizations
  WHERE id = org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', org_id;
  END IF;
  
  -- If not in trial mode, it can't be expired
  IF NOT org_record.is_trial THEN
    RETURN false;
  END IF;
  
  -- Check if trial expiry date has passed
  RETURN org_record.trial_expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get trial days remaining
CREATE OR REPLACE FUNCTION get_trial_days_remaining(org_id text)
RETURNS integer AS $$
DECLARE
  org_record RECORD;
  days_remaining integer;
BEGIN
  SELECT is_trial, trial_expires_at INTO org_record
  FROM organizations
  WHERE id = org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', org_id;
  END IF;
  
  -- If not in trial mode, return null
  IF NOT org_record.is_trial THEN
    RETURN NULL;
  END IF;
  
  -- Calculate days remaining (can be negative if expired)
  days_remaining := EXTRACT(DAY FROM (org_record.trial_expires_at - NOW()));
  
  RETURN days_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if organization has paid license
CREATE OR REPLACE FUNCTION has_paid_license(org_id text)
RETURNS boolean AS $$
DECLARE
  license_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 
    FROM organization_licenses 
    WHERE organization_id = org_id 
      AND expires_at > NOW()
  ) INTO license_exists;
  
  RETURN license_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get license availability info
CREATE OR REPLACE FUNCTION check_license_availability(org_id text)
RETURNS JSON AS $$
DECLARE
  license_record RECORD;
  org_record RECORD;
BEGIN
  -- Get organization info
  SELECT is_trial INTO org_record
  FROM organizations
  WHERE id = org_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'error', 'Organization not found'
    );
  END IF;
  
  -- If in trial, no paid licenses
  IF org_record.is_trial THEN
    RETURN json_build_object(
      'has_license', false,
      'is_trial', true,
      'can_add_member', false,
      'reason', 'TRIAL_MODE',
      'message', 'Please upgrade to a paid plan to invite team members'
    );
  END IF;
  
  -- Get license info
  SELECT * INTO license_record
  FROM organization_licenses
  WHERE organization_id = org_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'has_license', false,
      'is_trial', false,
      'can_add_member', false,
      'reason', 'NO_LICENSE',
      'message', 'No license found for this organization'
    );
  END IF;
  
  -- Check if license is expired
  IF license_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'has_license', true,
      'is_expired', true,
      'can_add_member', false,
      'reason', 'LICENSE_EXPIRED',
      'message', 'License has expired. Please renew.'
    );
  END IF;
  
  -- Check if licenses are available
  IF license_record.used_licenses >= license_record.total_licenses THEN
    RETURN json_build_object(
      'has_license', true,
      'can_add_member', false,
      'reason', 'NO_AVAILABLE_LICENSES',
      'message', 'All licenses are in use. Please upgrade your plan.',
      'total_licenses', license_record.total_licenses,
      'used_licenses', license_record.used_licenses
    );
  END IF;
  
  -- All good, can add member
  RETURN json_build_object(
    'has_license', true,
    'can_add_member', true,
    'available_licenses', license_record.total_licenses - license_record.used_licenses,
    'total_licenses', license_record.total_licenses,
    'used_licenses', license_record.used_licenses,
    'expires_at', license_record.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment used licenses (with validation)
CREATE OR REPLACE FUNCTION increment_used_licenses(org_id text)
RETURNS void AS $$
BEGIN
  UPDATE organization_licenses
  SET used_licenses = used_licenses + 1,
      updated_at = NOW()
  WHERE organization_id = org_id
    AND used_licenses < total_licenses
    AND expires_at > NOW();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot increment licenses: No available licenses or license expired';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement used licenses (when removing member)
CREATE OR REPLACE FUNCTION decrement_used_licenses(org_id text)
RETURNS void AS $$
BEGIN
  UPDATE organization_licenses
  SET used_licenses = GREATEST(used_licenses - 1, 1), -- Never go below 1 (owner)
      updated_at = NOW()
  WHERE organization_id = org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization license not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- MIGRATION 5: Update existing data (optional)
-- ============================================================================

-- Set existing organizations to trial mode if they don't have licenses
-- (Only run this if you have existing organizations without licenses)

-- UPDATE organizations
-- SET is_trial = true,
--     trial_expires_at = NOW() + INTERVAL '14 days'
-- WHERE id NOT IN (SELECT organization_id FROM organization_licenses)
--   AND is_trial IS NULL;

-- Set existing organizations to paid mode if they have licenses
-- UPDATE organizations
-- SET is_trial = false
-- WHERE id IN (SELECT organization_id FROM organization_licenses)
--   AND is_trial IS NULL;


-- ============================================================================
-- MIGRATION 6: Add Row Level Security (RLS) policies if needed
-- ============================================================================

-- Example RLS policy for organizations table
-- ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can view their own organization"
-- ON organizations FOR SELECT
-- USING (
--   owner_id = auth.uid() OR
--   id IN (
--     SELECT organization_id 
--     FROM organization_members 
--     WHERE user_id = auth.uid()
--   )
-- );


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these queries after migration to verify everything is correct

-- Check that all columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('is_trial', 'trial_expires_at');

SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'pending_organizations'
  AND column_name = 'user_id';

SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'organization_licenses'
  AND column_name IN ('trial_expires_at', 'used_licenses');

-- Check that indexes exist
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename IN ('organizations', 'pending_organizations')
  AND indexname LIKE 'idx_%';

-- Check that functions exist
SELECT 
  routine_name, 
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_trial_expired',
    'get_trial_days_remaining',
    'has_paid_license',
    'check_license_availability',
    'increment_used_licenses',
    'decrement_used_licenses'
  );

-- Test the helper functions (replace 'your-org-id' with actual org ID)
-- SELECT is_trial_expired('your-org-id');
-- SELECT get_trial_days_remaining('your-org-id');
-- SELECT has_paid_license('your-org-id');
-- SELECT check_license_availability('your-org-id');


-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- Uncomment and run these commands if you need to rollback the migrations

-- Drop helper functions
-- DROP FUNCTION IF EXISTS is_trial_expired(text);
-- DROP FUNCTION IF EXISTS get_trial_days_remaining(text);
-- DROP FUNCTION IF EXISTS has_paid_license(text);
-- DROP FUNCTION IF EXISTS check_license_availability(text);
-- DROP FUNCTION IF EXISTS increment_used_licenses(text);
-- DROP FUNCTION IF EXISTS decrement_used_licenses(text);

-- Drop indexes
-- DROP INDEX IF EXISTS idx_organizations_trial_expires;
-- DROP INDEX IF EXISTS idx_pending_organizations_user_id;
-- DROP INDEX IF EXISTS idx_pending_organizations_user_email;

-- Drop columns
-- ALTER TABLE organizations DROP COLUMN IF EXISTS is_trial;
-- ALTER TABLE organizations DROP COLUMN IF EXISTS trial_expires_at;
-- ALTER TABLE pending_organizations DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS trial_expires_at;
-- ALTER TABLE organization_licenses ALTER COLUMN used_licenses SET DEFAULT 0;
