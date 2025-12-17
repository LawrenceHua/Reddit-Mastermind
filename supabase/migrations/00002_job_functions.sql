-- Job claiming function using FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_next_job(
  worker_id TEXT,
  lock_timeout_ms INTEGER DEFAULT 300000
)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claimed_job jobs;
BEGIN
  -- Find and lock the next available job
  SELECT * INTO claimed_job
  FROM jobs
  WHERE status = 'queued'
    AND run_at <= NOW()
    AND (locked_at IS NULL OR locked_at < NOW() - (lock_timeout_ms || ' milliseconds')::interval)
  ORDER BY run_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  -- If we found a job, update its lock status
  IF claimed_job.id IS NOT NULL THEN
    UPDATE jobs
    SET 
      locked_at = NOW(),
      locked_by = worker_id,
      updated_at = NOW()
    WHERE id = claimed_job.id;
    
    -- Return the job with updated lock info
    claimed_job.locked_at := NOW();
    claimed_job.locked_by := worker_id;
    RETURN NEXT claimed_job;
  END IF;
  
  RETURN;
END;
$$;

-- Function to clean up stale locks
CREATE OR REPLACE FUNCTION cleanup_stale_job_locks(
  lock_timeout_ms INTEGER DEFAULT 300000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  UPDATE jobs
  SET 
    locked_at = NULL,
    locked_by = NULL,
    status = 'queued',
    updated_at = NOW()
  WHERE status = 'running'
    AND locked_at < NOW() - (lock_timeout_ms || ' milliseconds')::interval;
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$;

-- Index for efficient job claiming
CREATE INDEX IF NOT EXISTS idx_jobs_claimable 
ON jobs (run_at, status) 
WHERE status = 'queued';

