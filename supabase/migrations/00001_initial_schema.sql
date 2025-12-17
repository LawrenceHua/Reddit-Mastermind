-- Reddit Ops Planner - Initial Schema Migration
-- This migration creates all core tables, enums, indexes, and RLS policies

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE org_role AS ENUM ('admin', 'operator', 'assistant', 'viewer');
CREATE TYPE week_status AS ENUM ('draft', 'approved', 'scheduled', 'published');
CREATE TYPE item_status AS ENUM ('draft', 'needs_review', 'approved', 'scheduled', 'posted', 'failed');
CREATE TYPE asset_type AS ENUM ('post', 'comment', 'followup');
CREATE TYPE asset_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE run_type AS ENUM ('week_gen', 'regen_item');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'succeeded', 'failed');
CREATE TYPE job_type AS ENUM ('generate_week', 'generate_item', 'publish_item', 'ingest_metrics');
CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE topic_seed_type AS ENUM ('target_query', 'pain_point', 'competitor', 'faq');
CREATE TYPE quality_rater AS ENUM ('heuristic', 'llm', 'human');

-- ============================================
-- CORE TENANCY TABLES
-- ============================================

-- Organizations
CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization Members (maps users to orgs with roles)
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);

-- ============================================
-- PROJECT TABLES
-- ============================================

-- Projects (client workspaces)
CREATE TABLE projects (
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

CREATE INDEX idx_projects_org_id ON projects(org_id);

-- Personas (writing styles / team members)
CREATE TABLE personas (
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

CREATE INDEX idx_personas_project_id ON personas(project_id);
CREATE INDEX idx_personas_active ON personas(project_id, active) WHERE active = TRUE;

-- Subreddits (target communities)
CREATE TABLE subreddits (
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

CREATE INDEX idx_subreddits_project_id ON subreddits(project_id);

-- Topic Seeds (content ideas and target queries)
CREATE TABLE topic_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  seed_type topic_seed_type NOT NULL,
  text TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_topic_seeds_project_id ON topic_seeds(project_id);
CREATE INDEX idx_topic_seeds_active ON topic_seeds(project_id, active) WHERE active = TRUE;

-- ============================================
-- CALENDAR AND CONTENT TABLES
-- ============================================

-- Calendar Weeks
CREATE TABLE calendar_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  status week_status NOT NULL DEFAULT 'draft',
  generation_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, week_start_date)
);

CREATE INDEX idx_calendar_weeks_project_id ON calendar_weeks(project_id);
CREATE INDEX idx_calendar_weeks_status ON calendar_weeks(project_id, status);

-- Calendar Items (individual scheduled posts)
CREATE TABLE calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_week_id UUID NOT NULL REFERENCES calendar_weeks(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  subreddit_id UUID NOT NULL REFERENCES subreddits(id) ON DELETE RESTRICT,
  primary_persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE RESTRICT,
  status item_status NOT NULL DEFAULT 'draft',
  topic_cluster_key TEXT,
  risk_flags_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_items_week_id ON calendar_items(calendar_week_id);
CREATE INDEX idx_calendar_items_scheduled ON calendar_items(scheduled_at);
CREATE INDEX idx_calendar_items_status ON calendar_items(status);
CREATE INDEX idx_calendar_items_topic ON calendar_items(topic_cluster_key) WHERE topic_cluster_key IS NOT NULL;

-- Content Assets (versioned content - posts, comments, followups)
CREATE TABLE content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_item_id UUID NOT NULL REFERENCES calendar_items(id) ON DELETE CASCADE,
  asset_type asset_type NOT NULL,
  author_persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE RESTRICT,
  title TEXT,
  body_md TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  status asset_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_assets_item_id ON content_assets(calendar_item_id);
CREATE INDEX idx_content_assets_active ON content_assets(calendar_item_id, status) WHERE status = 'active';

-- ============================================
-- GENERATION AND SCORING TABLES
-- ============================================

-- Generation Runs (tracks LLM generation jobs)
CREATE TABLE generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_type run_type NOT NULL,
  inputs_json JSONB NOT NULL DEFAULT '{}',
  model_config_json JSONB NOT NULL DEFAULT '{}',
  status run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generation_runs_project_id ON generation_runs(project_id);
CREATE INDEX idx_generation_runs_status ON generation_runs(status);

-- Add foreign key from calendar_weeks to generation_runs
ALTER TABLE calendar_weeks 
ADD CONSTRAINT fk_calendar_weeks_generation_run 
FOREIGN KEY (generation_run_id) REFERENCES generation_runs(id) ON DELETE SET NULL;

-- Quality Scores (evaluation metrics per asset)
CREATE TABLE quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  dimensions_json JSONB NOT NULL DEFAULT '{}',
  overall_score NUMERIC(4,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 10),
  rater quality_rater NOT NULL DEFAULT 'heuristic',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_scores_asset_id ON quality_scores(asset_id);

-- ============================================
-- AUDIT AND JOBS TABLES
-- ============================================

-- Audit Logs (tracks all mutations)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  diff_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_project_id ON audit_logs(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Jobs (background task queue)
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_type job_type NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  status job_status NOT NULL DEFAULT 'queued',
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_status_run ON jobs(status, run_at) WHERE status = 'queued';
CREATE INDEX idx_jobs_project_id ON jobs(project_id);
CREATE INDEX idx_jobs_locked ON jobs(locked_at) WHERE locked_at IS NOT NULL;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get current user's org IDs
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid();
$$;

-- Get current user's role in an org
CREATE OR REPLACE FUNCTION get_user_role_in_org(target_org_id UUID)
RETURNS org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM org_members WHERE user_id = auth.uid() AND org_id = target_org_id;
$$;

-- Check if current user has at least viewer access to an org
CREATE OR REPLACE FUNCTION user_has_org_access(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members 
    WHERE user_id = auth.uid() AND org_id = target_org_id
  );
$$;

-- Check if current user can write to an org (operator or higher)
CREATE OR REPLACE FUNCTION user_can_write_org(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members 
    WHERE user_id = auth.uid() 
    AND org_id = target_org_id 
    AND role IN ('admin', 'operator')
  );
$$;

-- Check if current user is admin of an org
CREATE OR REPLACE FUNCTION user_is_org_admin(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members 
    WHERE user_id = auth.uid() 
    AND org_id = target_org_id 
    AND role = 'admin'
  );
$$;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_orgs_updated_at BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON org_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_personas_updated_at BEFORE UPDATE ON personas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subreddits_updated_at BEFORE UPDATE ON subreddits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_topic_seeds_updated_at BEFORE UPDATE ON topic_seeds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendar_weeks_updated_at BEFORE UPDATE ON calendar_weeks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendar_items_updated_at BEFORE UPDATE ON calendar_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_content_assets_updated_at BEFORE UPDATE ON content_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

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

-- ============================================
-- RLS POLICIES: ORGS
-- ============================================

-- Users can see orgs they belong to
CREATE POLICY "Users can view their orgs"
ON orgs FOR SELECT
USING (user_has_org_access(id));

-- Users can create orgs (anyone authenticated)
CREATE POLICY "Users can create orgs"
ON orgs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Only admins can update orgs
CREATE POLICY "Admins can update orgs"
ON orgs FOR UPDATE
USING (user_is_org_admin(id));

-- Only admins can delete orgs
CREATE POLICY "Admins can delete orgs"
ON orgs FOR DELETE
USING (user_is_org_admin(id));

-- ============================================
-- RLS POLICIES: ORG_MEMBERS
-- ============================================

-- Users can see members of their orgs
CREATE POLICY "Users can view org members"
ON org_members FOR SELECT
USING (user_has_org_access(org_id));

-- Allow inserting own membership (for signup flow)
CREATE POLICY "Users can add themselves to orgs"
ON org_members FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins can manage members
CREATE POLICY "Admins can update org members"
ON org_members FOR UPDATE
USING (user_is_org_admin(org_id));

CREATE POLICY "Admins can delete org members"
ON org_members FOR DELETE
USING (user_is_org_admin(org_id));

-- ============================================
-- RLS POLICIES: PROJECTS
-- ============================================

-- Users can view projects in their orgs
CREATE POLICY "Users can view org projects"
ON projects FOR SELECT
USING (user_has_org_access(org_id));

-- Operators and admins can create projects
CREATE POLICY "Operators can create projects"
ON projects FOR INSERT
WITH CHECK (user_can_write_org(org_id));

-- Operators and admins can update projects
CREATE POLICY "Operators can update projects"
ON projects FOR UPDATE
USING (user_can_write_org(org_id));

-- Only admins can delete projects
CREATE POLICY "Admins can delete projects"
ON projects FOR DELETE
USING (user_is_org_admin(org_id));

-- ============================================
-- RLS POLICIES: PERSONAS, SUBREDDITS, TOPIC_SEEDS
-- ============================================

-- Helper function to get org_id from project
CREATE OR REPLACE FUNCTION get_project_org_id(target_project_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM projects WHERE id = target_project_id;
$$;

-- PERSONAS
CREATE POLICY "Users can view personas"
ON personas FOR SELECT
USING (user_has_org_access(get_project_org_id(project_id)));

CREATE POLICY "Operators can create personas"
ON personas FOR INSERT
WITH CHECK (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Operators can update personas"
ON personas FOR UPDATE
USING (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Admins can delete personas"
ON personas FOR DELETE
USING (user_is_org_admin(get_project_org_id(project_id)));

-- SUBREDDITS
CREATE POLICY "Users can view subreddits"
ON subreddits FOR SELECT
USING (user_has_org_access(get_project_org_id(project_id)));

CREATE POLICY "Operators can create subreddits"
ON subreddits FOR INSERT
WITH CHECK (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Operators can update subreddits"
ON subreddits FOR UPDATE
USING (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Admins can delete subreddits"
ON subreddits FOR DELETE
USING (user_is_org_admin(get_project_org_id(project_id)));

-- TOPIC_SEEDS
CREATE POLICY "Users can view topic seeds"
ON topic_seeds FOR SELECT
USING (user_has_org_access(get_project_org_id(project_id)));

CREATE POLICY "Operators can create topic seeds"
ON topic_seeds FOR INSERT
WITH CHECK (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Operators can update topic seeds"
ON topic_seeds FOR UPDATE
USING (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Admins can delete topic seeds"
ON topic_seeds FOR DELETE
USING (user_is_org_admin(get_project_org_id(project_id)));

-- ============================================
-- RLS POLICIES: CALENDAR_WEEKS
-- ============================================

CREATE OR REPLACE FUNCTION get_calendar_week_org_id(target_week_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT p.org_id FROM calendar_weeks cw 
  JOIN projects p ON p.id = cw.project_id 
  WHERE cw.id = target_week_id;
$$;

CREATE POLICY "Users can view calendar weeks"
ON calendar_weeks FOR SELECT
USING (user_has_org_access(get_project_org_id(project_id)));

CREATE POLICY "Operators can create calendar weeks"
ON calendar_weeks FOR INSERT
WITH CHECK (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Operators can update calendar weeks"
ON calendar_weeks FOR UPDATE
USING (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Admins can delete calendar weeks"
ON calendar_weeks FOR DELETE
USING (user_is_org_admin(get_project_org_id(project_id)));

-- ============================================
-- RLS POLICIES: CALENDAR_ITEMS
-- ============================================

CREATE POLICY "Users can view calendar items"
ON calendar_items FOR SELECT
USING (user_has_org_access(get_calendar_week_org_id(calendar_week_id)));

CREATE POLICY "Operators can create calendar items"
ON calendar_items FOR INSERT
WITH CHECK (user_can_write_org(get_calendar_week_org_id(calendar_week_id)));

CREATE POLICY "Operators can update calendar items"
ON calendar_items FOR UPDATE
USING (user_can_write_org(get_calendar_week_org_id(calendar_week_id)));

CREATE POLICY "Admins can delete calendar items"
ON calendar_items FOR DELETE
USING (user_is_org_admin(get_calendar_week_org_id(calendar_week_id)));

-- ============================================
-- RLS POLICIES: CONTENT_ASSETS
-- ============================================

CREATE OR REPLACE FUNCTION get_content_asset_org_id(target_asset_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT p.org_id FROM content_assets ca
  JOIN calendar_items ci ON ci.id = ca.calendar_item_id
  JOIN calendar_weeks cw ON cw.id = ci.calendar_week_id
  JOIN projects p ON p.id = cw.project_id
  WHERE ca.id = target_asset_id;
$$;

CREATE OR REPLACE FUNCTION get_calendar_item_org_id(target_item_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT p.org_id FROM calendar_items ci
  JOIN calendar_weeks cw ON cw.id = ci.calendar_week_id
  JOIN projects p ON p.id = cw.project_id
  WHERE ci.id = target_item_id;
$$;

CREATE POLICY "Users can view content assets"
ON content_assets FOR SELECT
USING (user_has_org_access(get_calendar_item_org_id(calendar_item_id)));

CREATE POLICY "Operators can create content assets"
ON content_assets FOR INSERT
WITH CHECK (user_can_write_org(get_calendar_item_org_id(calendar_item_id)));

CREATE POLICY "Operators can update content assets"
ON content_assets FOR UPDATE
USING (user_can_write_org(get_calendar_item_org_id(calendar_item_id)));

CREATE POLICY "Admins can delete content assets"
ON content_assets FOR DELETE
USING (user_is_org_admin(get_calendar_item_org_id(calendar_item_id)));

-- ============================================
-- RLS POLICIES: GENERATION_RUNS
-- ============================================

CREATE POLICY "Users can view generation runs"
ON generation_runs FOR SELECT
USING (user_has_org_access(get_project_org_id(project_id)));

CREATE POLICY "Operators can create generation runs"
ON generation_runs FOR INSERT
WITH CHECK (user_can_write_org(get_project_org_id(project_id)));

CREATE POLICY "Operators can update generation runs"
ON generation_runs FOR UPDATE
USING (user_can_write_org(get_project_org_id(project_id)));

-- ============================================
-- RLS POLICIES: QUALITY_SCORES
-- ============================================

CREATE POLICY "Users can view quality scores"
ON quality_scores FOR SELECT
USING (user_has_org_access(get_content_asset_org_id(asset_id)));

CREATE POLICY "Operators can create quality scores"
ON quality_scores FOR INSERT
WITH CHECK (user_can_write_org(get_content_asset_org_id(asset_id)));

CREATE POLICY "Operators can update quality scores"
ON quality_scores FOR UPDATE
USING (user_can_write_org(get_content_asset_org_id(asset_id)));

-- ============================================
-- RLS POLICIES: AUDIT_LOGS
-- ============================================

-- Only readable by org members, not directly writable (use server-side insert)
CREATE POLICY "Users can view org audit logs"
ON audit_logs FOR SELECT
USING (user_has_org_access(org_id));

-- Service role can insert audit logs (bypass RLS)
-- Application code should use service role key for audit log writes

-- ============================================
-- RLS POLICIES: JOBS
-- ============================================

CREATE POLICY "Users can view jobs"
ON jobs FOR SELECT
USING (user_has_org_access(org_id));

CREATE POLICY "Operators can create jobs"
ON jobs FOR INSERT
WITH CHECK (user_can_write_org(org_id));

CREATE POLICY "Operators can update jobs"
ON jobs FOR UPDATE
USING (user_can_write_org(org_id));

-- Jobs are processed by service role, not deleted by users

