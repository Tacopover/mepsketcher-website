-- ============================================================================
-- HOTFIX: Fix permission denied error for get_available_licenses function
-- Run this in Supabase SQL Editor to fix the auth schema access error
-- ============================================================================

-- Drop the old function
DROP FUNCTION IF EXISTS get_available_licenses(TEXT);

-- Recreate with SECURITY INVOKER instead of SECURITY DEFINER
-- This makes the function run with the caller's permissions, avoiding auth schema issues
CREATE OR REPLACE FUNCTION get_available_licenses(org_id TEXT)
RETURNS JSON AS $$
DECLARE
  org_record RECORD;
  license_record RECORD;
BEGIN
  -- Get organization info
  SELECT is_trial INTO org_record
  FROM organizations
  WHERE id = org_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Organization not found'
    );
  END IF;
  
  -- If in trial mode, no licenses available for adding members
  IF org_record.is_trial THEN
    RETURN json_build_object(
      'success', true,
      'is_trial', true,
      'can_add_member', false,
      'total_licenses', 0,
      'used_licenses', 0,
      'available_licenses', 0,
      'message', 'Please upgrade to a paid plan to invite team members'
    );
  END IF;
  
  -- Get license info
  SELECT * INTO license_record
  FROM organization_licenses
  WHERE organization_id = org_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', true,
      'is_trial', false,
      'can_add_member', false,
      'total_licenses', 0,
      'used_licenses', 0,
      'available_licenses', 0,
      'message', 'No license found for this organization'
    );
  END IF;
  
  -- Check if license is expired
  IF license_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'success', true,
      'is_expired', true,
      'can_add_member', false,
      'total_licenses', license_record.total_licenses,
      'used_licenses', license_record.used_licenses,
      'available_licenses', 0,
      'message', 'License has expired. Please renew.'
    );
  END IF;
  
  -- Calculate available licenses
  RETURN json_build_object(
    'success', true,
    'can_add_member', (license_record.total_licenses - license_record.used_licenses) > 0,
    'total_licenses', license_record.total_licenses,
    'used_licenses', license_record.used_licenses,
    'available_licenses', license_record.total_licenses - license_record.used_licenses,
    'expires_at', license_record.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_available_licenses(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_licenses(TEXT) TO anon;

-- Verify the function exists
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_name = 'get_available_licenses';

-- Test query (optional - replace with your org ID)
-- SELECT get_available_licenses('your-org-id-here');
