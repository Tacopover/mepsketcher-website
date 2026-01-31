-- ============================================================================
-- Personal Trial Organization Schema Update
-- ============================================================================
-- This migration adds support for personal trial organizations that are
-- automatically created for new trial users and cleaned up when they join
-- a real organization or purchase a license.
--
-- Usage: Run this in Supabase SQL Editor
-- ============================================================================

-- Add flag to identify personal trial organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_personal_trial_org BOOLEAN DEFAULT false;

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_organizations_personal_trial 
ON organizations(is_personal_trial_org) 
WHERE is_personal_trial_org = true;

-- Add comment for documentation
COMMENT ON COLUMN organizations.is_personal_trial_org IS 
'True if this organization was auto-created for a trial user and should be cleaned up when user joins another org or purchases a license';

-- ============================================================================
-- Update handle_new_user() Trigger
-- ============================================================================
-- This trigger creates a personal trial organization for every new user
-- that signs up. The organization is marked with is_personal_trial_org=true
-- so it can be automatically cleaned up later.
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create a personal trial organization for the new user
  INSERT INTO organizations (name, is_personal_trial_org, created_at)
  VALUES (
    'Personal Trial - ' || NEW.email,
    true,  -- Mark as personal trial org for automatic cleanup
    NOW()
  )
  RETURNING id INTO new_org_id;
  
  -- Add user to organization_members as admin
  -- Note: user_profiles will be created by the signup edge function
  INSERT INTO organization_members (user_id, organization_id, role, status, has_license, accepted_at, created_at)
  VALUES (
    NEW.id,
    new_org_id,
    'admin',  -- User is admin of their personal trial org
    'active', -- Immediately active
    true,     -- Has trial license
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, organization_id) 
  WHERE status = 'active' AND user_id IS NOT NULL
  DO UPDATE 
  SET role = EXCLUDED.role,
      has_license = EXCLUDED.has_license;
  
  -- Create 14-day trial license
  INSERT INTO trial_licenses (user_id, expires_at, created_at)
  VALUES (
    NEW.id,
    NOW() + INTERVAL '14 days',
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Link user to trial (license_id is NULL for trials)
  INSERT INTO user_licenses (user_id, license_id)
  VALUES (NEW.id, NULL)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is properly attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check if column was added successfully
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'organizations' 
  AND column_name = 'is_personal_trial_org';

-- Check if index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'organizations'
  AND indexname = 'idx_organizations_personal_trial';

-- Check trigger status
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

COMMENT ON FUNCTION handle_new_user() IS 
'Automatically creates a personal trial organization when a new user signs up. The organization is marked with is_personal_trial_org=true for later cleanup.';
