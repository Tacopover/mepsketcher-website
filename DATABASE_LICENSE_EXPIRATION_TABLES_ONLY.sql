-- ============================================================================
-- LICENSE EXPIRATION & RENEWAL SYSTEM - SIMPLIFIED (Tables Only)
-- ============================================================================
-- This version contains only the database tables without any PL/pgSQL functions
-- All license validation logic is handled in the application layer (JavaScript/C#)
-- Date: 2026-01-21

-- ============================================================================
-- PART 1: License Notification Tracking
-- ============================================================================

-- Create table to track when notifications have been sent
CREATE TABLE IF NOT EXISTS license_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    license_id uuid NOT NULL REFERENCES organization_licenses(id) ON DELETE CASCADE,
    notification_type text NOT NULL, -- '30_day', '14_day', '7_day', '1_day', 'expired'
    sent_at timestamp with time zone NOT NULL DEFAULT NOW(),
    email_sent boolean DEFAULT false,
    dashboard_shown boolean DEFAULT false,
    desktop_shown boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_notification_type CHECK (notification_type IN ('30_day', '14_day', '7_day', '1_day', 'expired'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_license_notifications_org ON license_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_license_notifications_license ON license_notifications(license_id);
CREATE INDEX IF NOT EXISTS idx_license_notifications_type ON license_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_license_notifications_sent_at ON license_notifications(sent_at);

-- Add comments
COMMENT ON TABLE license_notifications IS 'Tracks all license expiration notifications sent to organizations';
COMMENT ON COLUMN license_notifications.notification_type IS 'Type of notification: 30_day, 14_day, 7_day, 1_day, or expired';
COMMENT ON COLUMN license_notifications.email_sent IS 'Whether email notification was successfully sent';
COMMENT ON COLUMN license_notifications.dashboard_shown IS 'Whether dashboard banner was shown';
COMMENT ON COLUMN license_notifications.desktop_shown IS 'Whether desktop app alert was shown';


-- ============================================================================
-- PART 2: Grace Period Tracking
-- ============================================================================

-- Add grace period fields to organization_licenses
ALTER TABLE organization_licenses
ADD COLUMN IF NOT EXISTS grace_period_start timestamp with time zone,
ADD COLUMN IF NOT EXISTS grace_period_end timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_renewal_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS renewal_reminder_sent boolean DEFAULT false;

-- Add comments
COMMENT ON COLUMN organization_licenses.grace_period_start IS 'When the 30-day grace period started (set when license expires)';
COMMENT ON COLUMN organization_licenses.grace_period_end IS 'When the 30-day grace period ends';
COMMENT ON COLUMN organization_licenses.last_renewal_date IS 'Date of most recent license renewal';
COMMENT ON COLUMN organization_licenses.renewal_reminder_sent IS 'Whether renewal reminder has been sent during this period';


-- ============================================================================
-- PART 3: Renewal History Tracking
-- ============================================================================

-- Create table to track all license renewals
CREATE TABLE IF NOT EXISTS license_renewal_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    license_id uuid NOT NULL REFERENCES organization_licenses(id) ON DELETE CASCADE,
    previous_expiry timestamp with time zone NOT NULL,
    new_expiry timestamp with time zone NOT NULL,
    licenses_count integer NOT NULL,
    previous_license_count integer,
    amount_paid decimal(10,2),
    paddle_transaction_id text,
    renewal_type text NOT NULL, -- 'standard', 'grace_period', 'new_purchase', 'prorated', 'early_renewal'
    renewed_by uuid REFERENCES auth.users(id),
    renewed_at timestamp with time zone NOT NULL DEFAULT NOW(),
    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_renewal_type CHECK (renewal_type IN ('standard', 'grace_period', 'new_purchase', 'prorated', 'early_renewal'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_renewal_history_org ON license_renewal_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_renewal_history_license ON license_renewal_history(license_id);
CREATE INDEX IF NOT EXISTS idx_renewal_history_renewed_at ON license_renewal_history(renewed_at);
CREATE INDEX IF NOT EXISTS idx_renewal_history_paddle_tx ON license_renewal_history(paddle_transaction_id);

-- Add comments
COMMENT ON TABLE license_renewal_history IS 'Complete history of all license renewals and extensions';
COMMENT ON COLUMN license_renewal_history.renewal_type IS 'Type of renewal: standard (normal), grace_period (after expiry), new_purchase (>30 days expired), prorated (mid-year add), early_renewal (before expiry)';
COMMENT ON COLUMN license_renewal_history.licenses_count IS 'Total license count after renewal';
COMMENT ON COLUMN license_renewal_history.previous_license_count IS 'License count before renewal';


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check that all tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('license_notifications', 'license_renewal_history');

-- Check that new columns were added to organization_licenses
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'organization_licenses'
  AND column_name IN ('grace_period_start', 'grace_period_end', 'last_renewal_date', 'renewal_reminder_sent');

-- Check that indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('license_notifications', 'license_renewal_history')
  AND indexname LIKE 'idx_%';


-- ============================================================================
-- USEFUL QUERIES FOR APPLICATION LOGIC
-- ============================================================================

-- Get licenses expiring in next 30 days
SELECT 
  ol.*,
  o.name as organization_name,
  EXTRACT(DAY FROM (ol.expires_at - NOW())) as days_until_expiry
FROM organization_licenses ol
JOIN organizations o ON o.id = ol.organization_id
WHERE ol.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
ORDER BY ol.expires_at;

-- Get licenses in grace period (expired 1-30 days ago)
SELECT 
  ol.*,
  o.name as organization_name,
  EXTRACT(DAY FROM (NOW() - ol.expires_at)) as days_expired,
  30 - EXTRACT(DAY FROM (NOW() - ol.expires_at)) as grace_days_remaining
FROM organization_licenses ol
JOIN organizations o ON o.id = ol.organization_id
WHERE ol.expires_at < NOW() 
  AND ol.expires_at > NOW() - INTERVAL '30 days'
ORDER BY ol.expires_at;

-- Get recently renewed licenses
SELECT 
  lrh.*,
  o.name as organization_name
FROM license_renewal_history lrh
JOIN organizations o ON o.id = lrh.organization_id
ORDER BY lrh.renewed_at DESC
LIMIT 20;

-- Check if notification was already sent today for a specific license
SELECT EXISTS (
  SELECT 1 
  FROM license_notifications
  WHERE license_id = 'YOUR_LICENSE_ID_HERE'
    AND notification_type = '7_day'
    AND sent_at::date = CURRENT_DATE
);


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE license_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_renewal_history ENABLE ROW LEVEL SECURITY;

-- license_notifications policies
-- Users can view notifications for their own organizations
CREATE POLICY "Users can view their org's license notifications"
ON license_notifications
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Users can insert notifications (for dashboard shown tracking)
CREATE POLICY "Users can insert notifications for their org"
ON license_notifications
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Service role can do everything (for Edge Function email notifications)
CREATE POLICY "Service role has full access to notifications"
ON license_notifications
FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- license_renewal_history policies
-- Users can view renewal history for their organizations
CREATE POLICY "Users can view their org's renewal history"
ON license_renewal_history
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Users can insert renewal records
CREATE POLICY "Users can insert renewal history for their org"
ON license_renewal_history
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Service role has full access
CREATE POLICY "Service role has full access to renewal history"
ON license_renewal_history
FOR ALL
USING (auth.jwt()->>'role' = 'service_role');


-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- Uncomment to rollback all changes:

-- DROP TABLE IF EXISTS license_renewal_history CASCADE;
-- DROP TABLE IF EXISTS license_notifications CASCADE;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS renewal_reminder_sent;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS last_renewal_date;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS grace_period_end;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS grace_period_start;
