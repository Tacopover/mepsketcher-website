-- ============================================================================
-- Verification reminder cron setup
-- ============================================================================
-- One-off script. Apply MANUALLY via the Supabase SQL editor / dashboard.
-- This is NOT part of the migration sequence.
--
-- Schedules a daily job that invokes the `send-verification-reminders` edge
-- function, which resends the confirmation email to unconfirmed signups
-- (1st reminder at 3 days, 2nd at 7 days).
--
-- PREREQUISITES:
--   1. Deploy the edge function:
--        npx supabase functions deploy send-verification-reminders
--   2. Set the function secrets (Dashboard > Edge Functions > Secrets, or CLI):
--        REMINDER_CRON_SECRET   <a long random string>
--        RESEND_API_KEY         (already set for send-verification-email)
--        SITE_URL               (already set for send-verification-email)
--   3. Replace the two placeholders below before running:
--        <REMINDER_CRON_SECRET>   must match the function secret above
--      (The project ref jskwfvwbhyltmxcdsbnm is already filled in.)
-- ============================================================================

-- Required extensions (no-op if already enabled).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with the same name so this script is re-runnable.
SELECT cron.unschedule('verification-reminders-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'verification-reminders-daily'
);

-- Schedule: every day at 09:00 UTC.
SELECT cron.schedule(
  'verification-reminders-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://jskwfvwbhyltmxcdsbnm.supabase.co/functions/v1/send-verification-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer <REMINDER_CRON_SECRET>'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Verify / inspect:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--     WHERE jobname = 'verification-reminders-daily';
--   SELECT * FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'verification-reminders-daily')
--     ORDER BY start_time DESC LIMIT 10;
--
-- Remove the schedule:
--   SELECT cron.unschedule('verification-reminders-daily');
-- ---------------------------------------------------------------------------
