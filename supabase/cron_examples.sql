-- Supabase Cron Job Examples
-- These use pg_cron and pg_net extensions for scheduled job processing

-- Enable required extensions (run once in Supabase SQL editor)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule worker tick to run every minute
-- This calls the Edge Function to process queued jobs

-- Example: Call worker_tick Edge Function every minute
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

-- Example: Cleanup stale job locks every 5 minutes
SELECT cron.schedule(
  'cleanup-stale-locks',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT cleanup_stale_job_locks(300000);
  $$
);

-- Example: Ingest metrics daily at 2 AM
SELECT cron.schedule(
  'daily-metrics-ingest',
  '0 2 * * *', -- 2 AM daily
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

-- View scheduled jobs
-- SELECT * FROM cron.job;

-- View job run history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Unschedule a job
-- SELECT cron.unschedule('worker-tick-every-minute');

-- Notes:
-- 1. Replace YOUR_PROJECT_REF with your actual Supabase project reference
-- 2. The service_role_key should be stored in app.settings or vault
-- 3. pg_cron runs in UTC timezone
-- 4. For high-frequency jobs, consider rate limits and costs

