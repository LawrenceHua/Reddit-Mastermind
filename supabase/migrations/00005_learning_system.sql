-- ============================================
-- LEARNING SYSTEM MIGRATION
-- Adds feedback collection, prompt examples, and experiments
-- ============================================

-- 1. Add feedback columns to content_assets
ALTER TABLE content_assets 
ADD COLUMN IF NOT EXISTS user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
ADD COLUMN IF NOT EXISTS user_feedback TEXT,
ADD COLUMN IF NOT EXISTS was_posted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reddit_score INTEGER,
ADD COLUMN IF NOT EXISTS reddit_url TEXT,
ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

-- 2. Create prompt_examples table for few-shot learning
CREATE TABLE IF NOT EXISTS prompt_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  subreddit_id UUID REFERENCES subreddits(id) ON DELETE SET NULL,
  
  -- The prompt context that was used
  prompt_context JSONB NOT NULL DEFAULT '{}',
  
  -- The successful output
  title TEXT,
  body_md TEXT NOT NULL,
  
  -- Performance metrics
  quality_score NUMERIC(4,2),
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  reddit_score INTEGER,
  
  -- Metadata
  source_asset_id UUID REFERENCES content_assets(id) ON DELETE SET NULL,
  is_curated BOOLEAN DEFAULT FALSE,  -- Manually marked as exemplary
  use_count INTEGER DEFAULT 0,  -- How many times used in prompts
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_examples_project ON prompt_examples(project_id);
CREATE INDEX idx_prompt_examples_quality ON prompt_examples(project_id, user_rating DESC, reddit_score DESC);

-- 3. Create experiments table for A/B testing
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Experiment variants
  variant_a JSONB NOT NULL DEFAULT '{}',  -- { model, prompt_version, temperature, etc. }
  variant_b JSONB NOT NULL DEFAULT '{}',
  
  -- Traffic split (0.5 = 50/50)
  traffic_split NUMERIC(3,2) DEFAULT 0.5,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed')),
  
  -- Results summary (updated periodically)
  results_summary JSONB DEFAULT '{}',
  
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_experiments_project ON experiments(project_id);
CREATE INDEX idx_experiments_status ON experiments(status) WHERE status = 'running';

-- 4. Create experiment_assignments table
CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  content_asset_id UUID NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('a', 'b')),
  
  -- Metrics for this assignment
  quality_score NUMERIC(4,2),
  user_rating INTEGER,
  reddit_score INTEGER,
  was_posted BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(experiment_id, content_asset_id)
);

CREATE INDEX idx_experiment_assignments_experiment ON experiment_assignments(experiment_id);

-- 5. Create learning_metrics table for tracking improvement over time
CREATE TABLE IF NOT EXISTS learning_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Aggregate metrics
  total_generated INTEGER DEFAULT 0,
  total_posted INTEGER DEFAULT 0,
  avg_quality_score NUMERIC(4,2),
  avg_user_rating NUMERIC(3,2),
  avg_reddit_score NUMERIC(10,2),
  edit_rate NUMERIC(5,4),  -- % of content that was edited
  regeneration_rate NUMERIC(5,4),  -- % of content that was regenerated
  
  -- Breakdown by rating
  rating_distribution JSONB DEFAULT '{}',  -- { "1": 5, "2": 10, "3": 20, ... }
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(project_id, period_start, period_end)
);

CREATE INDEX idx_learning_metrics_project ON learning_metrics(project_id, period_start DESC);

-- 6. Add RLS policies
ALTER TABLE prompt_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_metrics ENABLE ROW LEVEL SECURITY;

-- Prompt examples policies
CREATE POLICY "Users can view their org's prompt examples"
ON prompt_examples FOR SELECT
USING (
  project_id IN (
    SELECT p.id FROM projects p
    JOIN org_members om ON p.org_id = om.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert prompt examples for their projects"
ON prompt_examples FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT p.id FROM projects p
    JOIN org_members om ON p.org_id = om.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their org's prompt examples"
ON prompt_examples FOR UPDATE
USING (
  project_id IN (
    SELECT p.id FROM projects p
    JOIN org_members om ON p.org_id = om.org_id
    WHERE om.user_id = auth.uid()
  )
);

-- Experiments policies
CREATE POLICY "Users can view their org's experiments"
ON experiments FOR SELECT
USING (
  project_id IN (
    SELECT p.id FROM projects p
    JOIN org_members om ON p.org_id = om.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage their org's experiments"
ON experiments FOR ALL
USING (
  project_id IN (
    SELECT p.id FROM projects p
    JOIN org_members om ON p.org_id = om.org_id
    WHERE om.user_id = auth.uid()
  )
);

-- Experiment assignments policies (via experiments)
CREATE POLICY "Users can view experiment assignments"
ON experiment_assignments FOR SELECT
USING (
  experiment_id IN (
    SELECT e.id FROM experiments e
    JOIN projects p ON e.project_id = p.id
    JOIN org_members om ON p.org_id = om.org_id
    WHERE om.user_id = auth.uid()
  )
);

-- Learning metrics policies
CREATE POLICY "Users can view their org's learning metrics"
ON learning_metrics FOR SELECT
USING (
  project_id IN (
    SELECT p.id FROM projects p
    JOIN org_members om ON p.org_id = om.org_id
    WHERE om.user_id = auth.uid()
  )
);

-- 7. Create function to auto-promote high-quality content to prompt_examples
CREATE OR REPLACE FUNCTION promote_to_prompt_example()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-promote content with 5-star rating that was actually posted
  IF NEW.user_rating = 5 AND NEW.was_posted = TRUE THEN
    INSERT INTO prompt_examples (
      project_id,
      persona_id,
      subreddit_id,
      prompt_context,
      title,
      body_md,
      quality_score,
      user_rating,
      reddit_score,
      source_asset_id
    )
    SELECT 
      cw.project_id,
      ci.persona_id,
      ci.subreddit_id,
      NEW.metadata_json,
      NEW.title,
      NEW.body_md,
      (NEW.metadata_json->>'quality_score')::NUMERIC,
      NEW.user_rating,
      NEW.reddit_score,
      NEW.id
    FROM content_assets ca
    JOIN calendar_items ci ON ca.calendar_item_id = ci.id
    JOIN calendar_weeks cw ON ci.calendar_week_id = cw.id
    WHERE ca.id = NEW.id
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-promotion
DROP TRIGGER IF EXISTS auto_promote_to_examples ON content_assets;
CREATE TRIGGER auto_promote_to_examples
AFTER UPDATE OF user_rating, was_posted ON content_assets
FOR EACH ROW
EXECUTE FUNCTION promote_to_prompt_example();

-- 8. Create function to calculate learning metrics
CREATE OR REPLACE FUNCTION calculate_learning_metrics(
  p_project_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO learning_metrics (
    project_id,
    period_start,
    period_end,
    total_generated,
    total_posted,
    avg_quality_score,
    avg_user_rating,
    avg_reddit_score,
    edit_rate,
    rating_distribution
  )
  SELECT 
    p_project_id,
    p_period_start,
    p_period_end,
    COUNT(*),
    COUNT(*) FILTER (WHERE was_posted = TRUE),
    AVG((metadata_json->>'quality_score')::NUMERIC),
    AVG(user_rating),
    AVG(reddit_score),
    COUNT(*) FILTER (WHERE version > 1)::NUMERIC / NULLIF(COUNT(*), 0),
    jsonb_build_object(
      '1', COUNT(*) FILTER (WHERE user_rating = 1),
      '2', COUNT(*) FILTER (WHERE user_rating = 2),
      '3', COUNT(*) FILTER (WHERE user_rating = 3),
      '4', COUNT(*) FILTER (WHERE user_rating = 4),
      '5', COUNT(*) FILTER (WHERE user_rating = 5)
    )
  FROM content_assets ca
  JOIN calendar_items ci ON ca.calendar_item_id = ci.id
  JOIN calendar_weeks cw ON ci.calendar_week_id = cw.id
  WHERE cw.project_id = p_project_id
    AND ca.created_at >= p_period_start
    AND ca.created_at < p_period_end + INTERVAL '1 day'
  ON CONFLICT (project_id, period_start, period_end) 
  DO UPDATE SET
    total_generated = EXCLUDED.total_generated,
    total_posted = EXCLUDED.total_posted,
    avg_quality_score = EXCLUDED.avg_quality_score,
    avg_user_rating = EXCLUDED.avg_user_rating,
    avg_reddit_score = EXCLUDED.avg_reddit_score,
    edit_rate = EXCLUDED.edit_rate,
    rating_distribution = EXCLUDED.rating_distribution;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

