-- Fix jobs table - add missing columns

-- Add org_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'org_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN org_id UUID REFERENCES orgs(id);
  END IF;
END $$;

-- Add other potentially missing columns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'project_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN project_id UUID REFERENCES projects(id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'job_type'
  ) THEN
    ALTER TABLE jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'generate_week';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'payload_json'
  ) THEN
    ALTER TABLE jobs ADD COLUMN payload_json JSONB DEFAULT '{}';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'priority'
  ) THEN
    ALTER TABLE jobs ADD COLUMN priority INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'attempts'
  ) THEN
    ALTER TABLE jobs ADD COLUMN attempts INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'max_attempts'
  ) THEN
    ALTER TABLE jobs ADD COLUMN max_attempts INTEGER DEFAULT 3;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'run_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN run_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN locked_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'locked_by'
  ) THEN
    ALTER TABLE jobs ADD COLUMN locked_by TEXT;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'last_error'
  ) THEN
    ALTER TABLE jobs ADD COLUMN last_error TEXT;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'jobs' 
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index for job queue processing
CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON jobs(status, run_at) WHERE status = 'pending';

-- Update RLS policies for jobs table
DROP POLICY IF EXISTS "Users can view jobs for their org" ON jobs;
DROP POLICY IF EXISTS "Service role can manage all jobs" ON jobs;

-- Allow authenticated users to view jobs in their org
CREATE POLICY "Users can view jobs for their org" ON jobs
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Allow authenticated users to insert jobs for their org
DROP POLICY IF EXISTS "Users can create jobs for their org" ON jobs;
CREATE POLICY "Users can create jobs for their org" ON jobs
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'jobs'
ORDER BY ordinal_position;

