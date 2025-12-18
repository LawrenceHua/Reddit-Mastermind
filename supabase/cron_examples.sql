-- Supabase Cron Job Examples for Reddit Ops Planner
-- These use pg_cron and pg_net extensions for scheduled job processing
--
-- IMPORTANT: These are examples. Comment out or remove what you don't need.
-- Run in the Supabase SQL Editor (Database > SQL Editor)

-- ============================================
-- SETUP (Run once)
-- ============================================

-- Enable required extensions (requires superuser/dashboard)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- WORKER TICK - Process queued jobs (Every minute)
-- ============================================

-- This calls the Edge Function to process generate_week, generate_item, etc.
-- Replace YOUR_PROJECT_REF with your actual project reference (e.g., "abcdefghijkl")

-- Option 1: Using service role key from app settings
SELECT cron.schedule(
  'worker-tick-every-minute',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/worker_tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================
-- STALE LOCK CLEANUP (Every 5 minutes)
-- ============================================

-- Releases job locks that have been held too long (crashed workers)
SELECT cron.schedule(
  'cleanup-stale-locks',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT cleanup_stale_job_locks(300000); -- 5 minute timeout
  $$
);

-- ============================================
-- DAILY METRICS INGESTION (Optional)
-- ============================================

-- Schedule metrics collection for published content
SELECT cron.schedule(
  'daily-metrics-ingest',
  '0 2 * * *', -- 2 AM UTC daily
  $$
  INSERT INTO jobs (org_id, project_id, job_type, payload_json, status, run_at)
  SELECT 
    p.org_id,
    p.id,
    'ingest_metrics',
    '{}'::jsonb,
    'queued',
    NOW()
  FROM projects p
  WHERE EXISTS (
    SELECT 1 FROM calendar_weeks cw 
    WHERE cw.project_id = p.id 
    AND cw.status = 'published'
  );
  $$
);

-- ============================================
-- MANAGEMENT COMMANDS
-- ============================================

-- View all scheduled jobs
-- SELECT * FROM cron.job;

-- View job run history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Unschedule a specific job
-- SELECT cron.unschedule('worker-tick-every-minute');
-- SELECT cron.unschedule('cleanup-stale-locks');
-- SELECT cron.unschedule('daily-metrics-ingest');

-- Manually trigger worker tick (for testing)
-- SELECT net.http_post(
--   url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/worker_tick',
--   headers := jsonb_build_object('Content-Type', 'application/json'),
--   body := '{}'::jsonb
-- );

-- ============================================
-- SECURITY NOTES
-- ============================================

-- 1. The Edge Function uses SUPABASE_SERVICE_ROLE_KEY (set automatically)
-- 2. For extra security, set CRON_SECRET env var in Edge Function settings
--    and use it in the Authorization header instead
-- 3. pg_cron runs with postgres superuser privileges
-- 4. Job functions (claim_next_job, cleanup_stale_job_locks) are restricted
--    to service_role only - regular users cannot call them

-- ============================================
-- DEPLOYMENT CHECKLIST
-- ============================================

-- [ ] Replace YOUR_PROJECT_REF with actual project reference
-- [ ] Enable pg_cron and pg_net extensions in Supabase dashboard
-- [ ] Deploy Edge Function: supabase functions deploy worker_tick
-- [ ] Set OPENAI_API_KEY in Edge Function secrets
-- [ ] Run this SQL to schedule the cron jobs
-- [ ] Verify jobs are running: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
