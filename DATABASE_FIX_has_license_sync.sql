-- Fix has_license column for existing organization members
-- Run this to synchronize existing data with the new logic

-- Step 1: Set has_license = true for all active members
UPDATE organization_members
SET has_license = true
WHERE status = 'active' 
  AND (has_license = false OR has_license IS NULL);

-- Step 2: Set has_license = false for all inactive/pending members
UPDATE organization_members
SET has_license = false
WHERE status IN ('inactive', 'pending') 
  AND has_license = true;

-- Step 3: Verify synchronization - check if counts match
-- This should show matching numbers for each organization
SELECT 
  o.name AS organization_name,
  ol.used_licenses AS license_count_in_table,
  COUNT(*) FILTER (WHERE om.has_license = true AND om.status = 'active') AS active_members_with_license,
  COUNT(*) FILTER (WHERE om.status = 'active') AS total_active_members,
  COUNT(*) FILTER (WHERE om.status = 'pending') AS pending_invitations,
  -- Highlight mismatches
  CASE 
    WHEN ol.used_licenses = COUNT(*) FILTER (WHERE om.has_license = true AND om.status = 'active') 
    THEN '✓ Synchronized'
    ELSE '✗ MISMATCH - needs manual review'
  END AS status
FROM organizations o
JOIN organization_licenses ol ON o.id = ol.organization_id
LEFT JOIN organization_members om ON o.id = om.organization_id
GROUP BY o.id, o.name, ol.used_licenses
ORDER BY o.name;

-- Step 4: Find specific mismatches (if any)
-- This query returns organizations where the counts don't match
SELECT 
  o.name AS organization_name,
  o.id AS organization_id,
  ol.used_licenses AS license_count,
  COUNT(*) FILTER (WHERE om.has_license = true AND om.status = 'active') AS members_with_license,
  ol.used_licenses - COUNT(*) FILTER (WHERE om.has_license = true AND om.status = 'active') AS difference
FROM organizations o
JOIN organization_licenses ol ON o.id = ol.organization_id
LEFT JOIN organization_members om ON o.id = om.organization_id
GROUP BY o.id, o.name, ol.used_licenses
HAVING ol.used_licenses != COUNT(*) FILTER (WHERE om.has_license = true AND om.status = 'active');

-- Step 5: Show detailed member status for mismatched organizations
-- Replace 'YOUR_ORG_ID' with actual organization ID from Step 4 if needed
-- SELECT 
--   om.user_id,
--   om.email,
--   om.status,
--   om.has_license,
--   om.role,
--   om.accepted_at,
--   om.removed_at
-- FROM organization_members om
-- WHERE om.organization_id = 'YOUR_ORG_ID'
-- ORDER BY om.status, om.accepted_at;
