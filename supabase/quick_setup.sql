-- Reddit Mastermind - Quick Setup (Essential Tables Only)
-- Copy this into Supabase SQL Editor and click Run

-- Enums (using DO block for IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE org_role AS ENUM ('admin', 'operator', 'assistant', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE week_status AS ENUM ('draft', 'approved', 'scheduled', 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE item_status AS ENUM ('draft', 'needs_review', 'approved', 'scheduled', 'posted', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM ('post', 'comment', 'followup');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE run_type AS ENUM ('week_gen', 'regen_item');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE run_status AS ENUM ('pending', 'running', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_type AS ENUM ('generate_week', 'generate_item', 'publish_item', 'ingest_metrics');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE topic_seed_type AS ENUM ('target_query', 'pain_point', 'competitor', 'faq');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_rater AS ENUM ('heuristic', 'llm', 'human');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Organizations
CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization Members
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company_profile_json JSONB NOT NULL DEFAULT '{}',
  brand_voice_json JSONB NOT NULL DEFAULT '{}',
  posts_per_week INTEGER NOT NULL DEFAULT 5,
  risk_tolerance risk_level NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Personas
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT,
  tone TEXT,
  expertise_tags TEXT[] NOT NULL DEFAULT '{}',
  writing_rules_json JSONB NOT NULL DEFAULT '{}',
  disclosure_rules_json JSONB NOT NULL DEFAULT '{"required": false}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subreddits
CREATE TABLE IF NOT EXISTS subreddits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allowed_post_types_json JSONB NOT NULL DEFAULT '["text"]',
  rules_text TEXT,
  risk_level risk_level NOT NULL DEFAULT 'medium',
  max_posts_per_week INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Topic Seeds
CREATE TABLE IF NOT EXISTS topic_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  seed_type topic_seed_type NOT NULL,
  text TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Calendar Weeks
CREATE TABLE IF NOT EXISTS calendar_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  status week_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, week_start_date)
);

-- Calendar Items
CREATE TABLE IF NOT EXISTS calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_week_id UUID NOT NULL REFERENCES calendar_weeks(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  subreddit_id UUID REFERENCES subreddits(id) ON DELETE SET NULL,
  primary_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  status item_status NOT NULL DEFAULT 'draft',
  topic_cluster_key TEXT,
  risk_flags_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Content Assets
CREATE TABLE IF NOT EXISTS content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_item_id UUID NOT NULL REFERENCES calendar_items(id) ON DELETE CASCADE,
  asset_type asset_type NOT NULL,
  author_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  title TEXT,
  body_md TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  status asset_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generation Runs
CREATE TABLE IF NOT EXISTS generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  calendar_week_id UUID REFERENCES calendar_weeks(id) ON DELETE SET NULL,
  run_type run_type NOT NULL,
  inputs_json JSONB NOT NULL DEFAULT '{}',
  model_config_json JSONB NOT NULL DEFAULT '{}',
  status run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quality Scores
CREATE TABLE IF NOT EXISTS quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  dimensions_json JSONB NOT NULL DEFAULT '{}',
  overall_score NUMERIC(4,2) NOT NULL,
  rater quality_rater NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  diff_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jobs Queue
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type job_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status job_status NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE subreddits ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow service role full access)
DROP POLICY IF EXISTS "Service role has full access to orgs" ON orgs;
CREATE POLICY "Service role has full access to orgs" ON orgs FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to org_members" ON org_members;
CREATE POLICY "Service role has full access to org_members" ON org_members FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to projects" ON projects;
CREATE POLICY "Service role has full access to projects" ON projects FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to personas" ON personas;
CREATE POLICY "Service role has full access to personas" ON personas FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to subreddits" ON subreddits;
CREATE POLICY "Service role has full access to subreddits" ON subreddits FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to topic_seeds" ON topic_seeds;
CREATE POLICY "Service role has full access to topic_seeds" ON topic_seeds FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to calendar_weeks" ON calendar_weeks;
CREATE POLICY "Service role has full access to calendar_weeks" ON calendar_weeks FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to calendar_items" ON calendar_items;
CREATE POLICY "Service role has full access to calendar_items" ON calendar_items FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to content_assets" ON content_assets;
CREATE POLICY "Service role has full access to content_assets" ON content_assets FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to generation_runs" ON generation_runs;
CREATE POLICY "Service role has full access to generation_runs" ON generation_runs FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to quality_scores" ON quality_scores;
CREATE POLICY "Service role has full access to quality_scores" ON quality_scores FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to audit_logs" ON audit_logs;
CREATE POLICY "Service role has full access to audit_logs" ON audit_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to jobs" ON jobs;
CREATE POLICY "Service role has full access to jobs" ON jobs FOR ALL USING (true);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
