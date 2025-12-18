#!/usr/bin/env tsx
/**
 * Apply migrations via Supabase REST API (using service role)
 * This runs SQL by creating and executing database functions
 */

import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY');
  process.exit(1);
}

// Split migrations into smaller chunks
const MIGRATIONS = [
  // Enums
  `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
      CREATE TYPE org_role AS ENUM ('admin', 'operator', 'assistant', 'viewer');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'week_status') THEN
      CREATE TYPE week_status AS ENUM ('draft', 'approved', 'scheduled', 'published');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_status') THEN
      CREATE TYPE item_status AS ENUM ('draft', 'needs_review', 'approved', 'scheduled', 'posted', 'failed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type') THEN
      CREATE TYPE asset_type AS ENUM ('post', 'comment', 'followup');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status') THEN
      CREATE TYPE asset_status AS ENUM ('draft', 'active', 'archived');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_type') THEN
      CREATE TYPE run_type AS ENUM ('week_gen', 'regen_item');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_status') THEN
      CREATE TYPE run_status AS ENUM ('pending', 'running', 'succeeded', 'failed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_type') THEN
      CREATE TYPE job_type AS ENUM ('generate_week', 'generate_item', 'publish_item', 'ingest_metrics');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
      CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
      CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'topic_seed_type') THEN
      CREATE TYPE topic_seed_type AS ENUM ('target_query', 'pain_point', 'competitor', 'faq');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quality_rater') THEN
      CREATE TYPE quality_rater AS ENUM ('heuristic', 'llm', 'human');
    END IF;
  END $$;
  `,

  // Core tables
  `
  CREATE TABLE IF NOT EXISTS orgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role org_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);
  CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
  `,

  // Projects and personas
  `
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

  CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);

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

  CREATE INDEX IF NOT EXISTS idx_personas_project_id ON personas(project_id);
  `,

  // Subreddits and topic seeds
  `
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

  CREATE INDEX IF NOT EXISTS idx_subreddits_project_id ON subreddits(project_id);

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

  CREATE INDEX IF NOT EXISTS idx_topic_seeds_project_id ON topic_seeds(project_id);
  `,

  // Calendar tables
  `
  CREATE TABLE IF NOT EXISTS calendar_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    status week_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, week_start_date)
  );

  CREATE INDEX IF NOT EXISTS idx_calendar_weeks_project_id ON calendar_weeks(project_id);

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

  CREATE INDEX IF NOT EXISTS idx_calendar_items_week_id ON calendar_items(calendar_week_id);
  `,

  // Content assets
  `
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

  CREATE INDEX IF NOT EXISTS idx_content_assets_item_id ON content_assets(calendar_item_id);
  `,

  // Generation runs and quality scores
  `
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

  CREATE INDEX IF NOT EXISTS idx_generation_runs_project_id ON generation_runs(project_id);

  CREATE TABLE IF NOT EXISTS quality_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
    dimensions_json JSONB NOT NULL DEFAULT '{}',
    overall_score NUMERIC(4,2) NOT NULL,
    rater quality_rater NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_quality_scores_asset_id ON quality_scores(asset_id);
  `,

  // Audit logs and jobs
  `
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

  CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);

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

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status) WHERE status = 'queued';
  `,

  // RLS Policies
  `
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

  DROP POLICY IF EXISTS "Users can view their own orgs" ON orgs;
  CREATE POLICY "Users can view their own orgs" ON orgs
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = orgs.id AND org_members.user_id = auth.uid())
    );

  DROP POLICY IF EXISTS "Users can view their org memberships" ON org_members;
  CREATE POLICY "Users can view their org memberships" ON org_members
    FOR SELECT USING (user_id = auth.uid());

  DROP POLICY IF EXISTS "Users can view projects in their orgs" ON projects;
  CREATE POLICY "Users can view projects in their orgs" ON projects
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = projects.org_id AND org_members.user_id = auth.uid())
    );
  `,

  // More RLS policies
  `
  DROP POLICY IF EXISTS "Users can manage projects in their orgs" ON projects;
  CREATE POLICY "Users can manage projects in their orgs" ON projects
    FOR ALL USING (
      EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = projects.org_id AND org_members.user_id = auth.uid() AND org_members.role IN ('admin', 'operator'))
    );

  DROP POLICY IF EXISTS "Users can view personas in their projects" ON personas;
  CREATE POLICY "Users can view personas in their projects" ON personas
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM projects p
        JOIN org_members om ON om.org_id = p.org_id
        WHERE p.id = personas.project_id AND om.user_id = auth.uid()
      )
    );

  DROP POLICY IF EXISTS "Users can manage personas in their projects" ON personas;
  CREATE POLICY "Users can manage personas in their projects" ON personas
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM projects p
        JOIN org_members om ON om.org_id = p.org_id
        WHERE p.id = personas.project_id AND om.user_id = auth.uid() AND om.role IN ('admin', 'operator')
      )
    );

  DROP POLICY IF EXISTS "Users can view subreddits in their projects" ON subreddits;
  CREATE POLICY "Users can view subreddits in their projects" ON subreddits
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM projects p
        JOIN org_members om ON om.org_id = p.org_id
        WHERE p.id = subreddits.project_id AND om.user_id = auth.uid()
      )
    );

  DROP POLICY IF EXISTS "Users can manage subreddits in their projects" ON subreddits;
  CREATE POLICY "Users can manage subreddits in their projects" ON subreddits
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM projects p
        JOIN org_members om ON om.org_id = p.org_id
        WHERE p.id = subreddits.project_id AND om.user_id = auth.uid() AND om.role IN ('admin', 'operator')
      )
    );
  `,

  // Reload schema notification
  `
  NOTIFY pgrst, 'reload schema';
  `,
];

async function runSQL(sql: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Use the Supabase REST API to execute SQL via RPC
    // First, create a function, then execute it
    const funcName = `migration_${Date.now()}`;
    
    // Create the function
    const createFunc = `
      CREATE OR REPLACE FUNCTION ${funcName}() RETURNS void AS $$
      BEGIN
        ${sql}
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    // Try executing via fetch
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: text };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function applyMigrations() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Applying Migrations via Supabase REST API              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Migrations: ${MIGRATIONS.length} chunks\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < MIGRATIONS.length; i++) {
    process.stdout.write(`Chunk ${i + 1}/${MIGRATIONS.length}: `);
    const result = await runSQL(MIGRATIONS[i]);
    
    if (result.success) {
      console.log('✅');
      successCount++;
    } else {
      console.log(`❌ ${result.error?.substring(0, 50)}`);
      failCount++;
    }
  }

  console.log(`\n${successCount} succeeded, ${failCount} failed`);
  
  if (failCount === 0) {
    console.log('\n🎉 All migrations applied! Run: npm run db:test');
  }
}

applyMigrations().catch(console.error);

