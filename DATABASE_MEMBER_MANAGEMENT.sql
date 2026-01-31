-- ============================================================================
-- Member Management Migration
-- Adds status-based member management with invitation flow
-- Date: 2025-10-19
-- ============================================================================

-- ============================================================================
-- STEP 1: Add columns to organization_members table
-- ============================================================================

-- Add status column for tracking member state
ALTER TABLE organization_members 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('active', 'inactive', 'pending'));

-- Add email column for pending invites (before user signs up)
ALTER TABLE organization_members 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add timestamp columns for tracking invitation lifecycle
ALTER TABLE organization_members 
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

ALTER TABLE organization_members 
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE organization_members 
ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Make user_id nullable (pending invites don't have user_id yet)
ALTER TABLE organization_members 
ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================================
-- STEP 2: Add constraints
-- ============================================================================

-- Constraint: either user_id OR email must be present
ALTER TABLE organization_members
DROP CONSTRAINT IF EXISTS user_id_or_email_required;

ALTER TABLE organization_members
ADD CONSTRAINT user_id_or_email_required 
CHECK (user_id IS NOT NULL OR email IS NOT NULL);

-- ============================================================================
-- STEP 3: Create indexes
-- ============================================================================

-- Index for quick filtering by status
DROP INDEX IF EXISTS idx_org_members_status;
CREATE INDEX idx_org_members_status 
ON organization_members(organization_id, status);

-- Unique constraint: one active membership per user per org
DROP INDEX IF EXISTS idx_unique_active_member;
CREATE UNIQUE INDEX idx_unique_active_member 
ON organization_members(user_id, organization_id) 
WHERE status = 'active' AND user_id IS NOT NULL;

-- Unique constraint: one pending invite per email per org
DROP INDEX IF EXISTS idx_unique_pending_invite;
CREATE UNIQUE INDEX idx_unique_pending_invite 
ON organization_members(email, organization_id) 
WHERE status = 'pending';

-- Index for email lookups
DROP INDEX IF EXISTS idx_org_members_email;
CREATE INDEX idx_org_members_email 
ON organization_members(email) 
WHERE email IS NOT NULL;

-- ============================================================================
-- STEP 4: Update existing data
-- ============================================================================

-- Set existing rows to 'active' status with accepted_at timestamp
UPDATE organization_members 
SET 
  status = 'active',
  accepted_at = COALESCE(created_at, NOW())
WHERE status IS NULL;

-- ============================================================================
-- STEP 5: Helper functions
-- ============================================================================

-- Function to get available licenses for an organization
-- IMPORTANT: Uses SECURITY DEFINER but avoids auth schema access
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_available_licenses(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_licenses(TEXT) TO anon;

-- ============================================================================
-- STEP 6: Comments for documentation
-- ============================================================================

COMMENT ON COLUMN organization_members.status IS 'Member status: active (full member), inactive (removed), pending (invited but not signed up)';
COMMENT ON COLUMN organization_members.email IS 'Email address for pending invitations (before user signup)';
COMMENT ON COLUMN organization_members.invited_at IS 'Timestamp when invitation was sent';
COMMENT ON COLUMN organization_members.accepted_at IS 'Timestamp when user accepted invitation or was added';
COMMENT ON COLUMN organization_members.removed_at IS 'Timestamp when member was removed from organization';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'organization_members'
  AND column_name IN ('status', 'email', 'invited_at', 'accepted_at', 'removed_at')
ORDER BY column_name;

-- Verify indexes exist
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename = 'organization_members'
  AND indexname LIKE 'idx_%'
ORDER BY indexname;

-- Verify constraints
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'organization_members'::regclass
ORDER BY conname;

-- Test the helper function (replace with actual org ID)
-- SELECT get_available_licenses('your-org-id-here');

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

/*
-- Uncomment to rollback changes

-- Drop function
DROP FUNCTION IF EXISTS get_available_licenses(TEXT);

-- Drop indexes
DROP INDEX IF EXISTS idx_org_members_status;
DROP INDEX IF EXISTS idx_unique_active_member;
DROP INDEX IF EXISTS idx_unique_pending_invite;
DROP INDEX IF EXISTS idx_org_members_email;

-- Drop constraints
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS user_id_or_email_required;

-- Make user_id NOT NULL again (will fail if pending invites exist)
-- ALTER TABLE organization_members ALTER COLUMN user_id SET NOT NULL;

-- Drop columns
ALTER TABLE organization_members DROP COLUMN IF EXISTS status;
ALTER TABLE organization_members DROP COLUMN IF EXISTS email;
ALTER TABLE organization_members DROP COLUMN IF EXISTS invited_at;
ALTER TABLE organization_members DROP COLUMN IF EXISTS accepted_at;
ALTER TABLE organization_members DROP COLUMN IF EXISTS removed_at;
*/
