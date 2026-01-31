-- ============================================================================
-- LICENSE EXPIRATION & RENEWAL SYSTEM - DATABASE MIGRATIONS
-- ============================================================================
-- Run these migrations to add license expiration tracking and renewal features
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
-- PART 4: Helper Functions
-- ============================================================================

-- Function to check if license is in grace period
CREATE OR REPLACE FUNCTION is_in_grace_period(license_expiry timestamp with time zone)
RETURNS boolean AS $$
BEGIN
    -- Grace period is 30 days after expiry
    RETURN license_expiry < NOW() 
       AND license_expiry > NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate days until expiry (negative if expired)
CREATE OR REPLACE FUNCTION days_until_expiry(license_expiry timestamp with time zone)
RETURNS integer AS $$
BEGIN
    RETURN EXTRACT(DAY FROM (license_expiry - NOW()))::integer;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get license status
CREATE OR REPLACE FUNCTION get_license_status(org_id text)
RETURNS JSON AS $$
DECLARE
    license_record RECORD;
    days_remaining integer;
    in_grace_period boolean;
BEGIN
    -- Get license info
    SELECT * INTO license_record
    FROM organization_licenses
    WHERE organization_id = org_id
    ORDER BY expires_at DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'status', 'no_license',
            'message', 'No license found'
        );
    END IF;
    
    days_remaining := days_until_expiry(license_record.expires_at);
    in_grace_period := is_in_grace_period(license_record.expires_at);
    
    -- Determine status
    IF days_remaining < -30 THEN
        RETURN json_build_object(
            'status', 'expired',
            'days_remaining', days_remaining,
            'in_grace_period', false,
            'expires_at', license_record.expires_at,
            'message', 'License expired more than 30 days ago',
            'severity', 'critical',
            'action_required', true
        );
    ELSIF in_grace_period THEN
        RETURN json_build_object(
            'status', 'grace_period',
            'days_remaining', days_remaining,
            'grace_days_left', 30 + days_remaining,
            'in_grace_period', true,
            'expires_at', license_record.expires_at,
            'message', format('License expired. %s days left in grace period', 30 + days_remaining),
            'severity', 'warning',
            'action_required', true
        );
    ELSIF days_remaining <= 0 THEN
        RETURN json_build_object(
            'status', 'just_expired',
            'days_remaining', days_remaining,
            'in_grace_period', false,
            'expires_at', license_record.expires_at,
            'message', 'License expired today',
            'severity', 'critical',
            'action_required', true
        );
    ELSIF days_remaining <= 7 THEN
        RETURN json_build_object(
            'status', 'expiring_soon',
            'days_remaining', days_remaining,
            'in_grace_period', false,
            'expires_at', license_record.expires_at,
            'message', format('License expires in %s days', days_remaining),
            'severity', 'critical',
            'action_required', true
        );
    ELSIF days_remaining <= 30 THEN
        RETURN json_build_object(
            'status', 'expiring_soon',
            'days_remaining', days_remaining,
            'in_grace_period', false,
            'expires_at', license_record.expires_at,
            'message', format('License expires in %s days', days_remaining),
            'severity', 'warning',
            'action_required', false
        );
    ELSE
        RETURN json_build_object(
            'status', 'active',
            'days_remaining', days_remaining,
            'in_grace_period', false,
            'expires_at', license_record.expires_at,
            'message', 'License is active',
            'severity', 'info',
            'action_required', false
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record license notification
CREATE OR REPLACE FUNCTION record_license_notification(
    org_id text,
    lic_id text,
    notif_type text,
    email_sent_flag boolean DEFAULT false,
    dashboard_shown_flag boolean DEFAULT false,
    desktop_shown_flag boolean DEFAULT false
)
RETURNS uuid AS $$
DECLARE
    notification_id uuid;
BEGIN
    -- Check if notification already exists for today
    SELECT id INTO notification_id
    FROM license_notifications
    WHERE organization_id = org_id
      AND license_id = lic_id
      AND notification_type = notif_type
      AND sent_at::date = NOW()::date;
    
    IF FOUND THEN
        -- Update existing notification
        UPDATE license_notifications
        SET email_sent = email_sent OR email_sent_flag,
            dashboard_shown = dashboard_shown OR dashboard_shown_flag,
            desktop_shown = desktop_shown OR desktop_shown_flag
        WHERE id = notification_id;
    ELSE
        -- Insert new notification
        INSERT INTO license_notifications (
            organization_id,
            license_id,
            notification_type,
            email_sent,
            dashboard_shown,
            desktop_shown
        ) VALUES (
            org_id,
            lic_id,
            notif_type,
            email_sent_flag,
            dashboard_shown_flag,
            desktop_shown_flag
        )
        RETURNING id INTO notification_id;
    END IF;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to start grace period
CREATE OR REPLACE FUNCTION start_grace_period(lic_id text)
RETURNS void AS $$
BEGIN
    UPDATE organization_licenses
    SET grace_period_start = NOW(),
        grace_period_end = NOW() + INTERVAL '30 days'
    WHERE id = lic_id
      AND grace_period_start IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- PART 5: Automatic Grace Period Trigger
-- ============================================================================

-- Trigger to automatically start grace period when license expires
CREATE OR REPLACE FUNCTION trigger_start_grace_period()
RETURNS TRIGGER AS $$
BEGIN
    -- If license just expired (expires_at changed and is now in the past)
    IF NEW.expires_at < NOW() AND (OLD.expires_at >= NOW() OR OLD.grace_period_start IS NULL) THEN
        NEW.grace_period_start := NOW();
        NEW.grace_period_end := NOW() + INTERVAL '30 days';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_start_grace_period ON organization_licenses;
CREATE TRIGGER auto_start_grace_period
    BEFORE UPDATE ON organization_licenses
    FOR EACH ROW
    EXECUTE FUNCTION trigger_start_grace_period();


-- ============================================================================
-- PART 6: Verification Queries
-- ============================================================================

-- Check that new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('license_notifications', 'license_renewal_history');

-- Check that new columns exist
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'organization_licenses'
  AND column_name IN ('grace_period_start', 'grace_period_end', 'last_renewal_date', 'renewal_reminder_sent');

-- Check that functions exist
SELECT routine_name 
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_in_grace_period',
    'days_until_expiry',
    'get_license_status',
    'record_license_notification',
    'start_grace_period'
  );


-- ============================================================================
-- PART 7: Test Data (Optional - for development only)
-- ============================================================================

-- Uncomment to create test scenarios:

-- -- Test Scenario 1: License expiring in 7 days
-- UPDATE organization_licenses 
-- SET expires_at = NOW() + INTERVAL '7 days'
-- WHERE organization_id = 'your-test-org-id';

-- -- Test Scenario 2: License in grace period (expired 10 days ago)
-- UPDATE organization_licenses 
-- SET expires_at = NOW() - INTERVAL '10 days',
--     grace_period_start = NOW() - INTERVAL '10 days',
--     grace_period_end = NOW() + INTERVAL '20 days'
-- WHERE organization_id = 'your-test-org-id';

-- -- Test the get_license_status function
-- SELECT get_license_status('your-test-org-id');


-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- Uncomment to rollback these migrations:

-- DROP TRIGGER IF EXISTS auto_start_grace_period ON organization_licenses;
-- DROP FUNCTION IF EXISTS trigger_start_grace_period();
-- DROP FUNCTION IF EXISTS start_grace_period(text);
-- DROP FUNCTION IF EXISTS record_license_notification(text, text, text, boolean, boolean, boolean);
-- DROP FUNCTION IF EXISTS get_license_status(text);
-- DROP FUNCTION IF EXISTS days_until_expiry(timestamp with time zone);
-- DROP FUNCTION IF EXISTS is_in_grace_period(timestamp with time zone);
-- DROP TABLE IF EXISTS license_renewal_history;
-- DROP TABLE IF EXISTS license_notifications;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS renewal_reminder_sent;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS last_renewal_date;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS grace_period_end;
-- ALTER TABLE organization_licenses DROP COLUMN IF EXISTS grace_period_start;
