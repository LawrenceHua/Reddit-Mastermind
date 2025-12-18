import { createAdminClient } from '@/lib/supabase/server';

export interface PromptExample {
  id: string;
  title: string | null;
  body_md: string;
  prompt_context: {
    persona_name?: string;
    persona_tone?: string;
    subreddit_name?: string;
    topic?: string;
    [key: string]: unknown;
  };
  quality_score: number | null;
  user_rating: number | null;
  reddit_score: number | null;
}

/**
 * Get top-performing examples for few-shot learning
 */
export async function getTopExamples(
  projectId: string,
  options: {
    limit?: number;
    minRating?: number;
    personaId?: string;
    subredditId?: string;
    assetType?: 'post' | 'comment' | 'followup';
  } = {}
): Promise<PromptExample[]> {
  const supabase = createAdminClient();
  const { limit = 3, minRating = 4, personaId, subredditId } = options;

  let query = supabase
    .from('prompt_examples')
    .select('*')
    .eq('project_id', projectId)
    .gte('user_rating', minRating)
    .order('user_rating', { ascending: false })
    .order('reddit_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (personaId) {
    query = query.eq('persona_id', personaId);
  }

  if (subredditId) {
    query = query.eq('subreddit_id', subredditId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching prompt examples:', error);
    return [];
  }

  // Update use count for these examples (non-critical, best effort)
  if (data && data.length > 0) {
    for (const example of data) {
      await (supabase
        .from('prompt_examples') as any)
        .update({ use_count: ((example as any).use_count || 0) + 1 })
        .eq('id', (example as any).id)
        .catch(() => {});
    }
  }

  return (data || []) as PromptExample[];
}

/**
 * Build few-shot examples section for a prompt
 */
export function buildFewShotSection(
  examples: PromptExample[],
  assetType: 'post' | 'comment' | 'followup' = 'post'
): string {
  if (examples.length === 0) {
    return '';
  }

  const typeLabel = {
    post: 'SUCCESSFUL POST',
    comment: 'SUCCESSFUL COMMENT',
    followup: 'SUCCESSFUL REPLY',
  }[assetType];

  const exampleStrings = examples.map((ex, i) => {
    const context = ex.prompt_context;
    const contextStr = [
      context.persona_name && `Persona: ${context.persona_name}`,
      context.subreddit_name && `Subreddit: r/${context.subreddit_name}`,
      context.topic && `Topic: ${context.topic}`,
    ]
      .filter(Boolean)
      .join(' | ');

    if (assetType === 'post') {
      return `--- ${typeLabel} #${i + 1} ---
Context: ${contextStr}
Title: ${ex.title || 'N/A'}
Body: ${ex.body_md}
Rating: ${ex.user_rating}/5 stars${ex.reddit_score ? `, ${ex.reddit_score} upvotes` : ''}`;
    } else {
      return `--- ${typeLabel} #${i + 1} ---
Context: ${contextStr}
Comment: ${ex.body_md}
Rating: ${ex.user_rating}/5 stars${ex.reddit_score ? `, ${ex.reddit_score} upvotes` : ''}`;
    }
  });

  return `
=== EXAMPLES OF HIGH-PERFORMING CONTENT ===
The following are real examples that received excellent feedback. Match this quality and style:

${exampleStrings.join('\n\n')}

=== END EXAMPLES ===
`;
}

/**
 * Manually curate an example as exemplary
 */
export async function curateExample(
  exampleId: string,
  isCurated: boolean
): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await (supabase
    .from('prompt_examples') as any)
    .update({ is_curated: isCurated, updated_at: new Date().toISOString() })
    .eq('id', exampleId);

  return !error;
}

/**
 * Manually add an example (for content that wasn't auto-promoted)
 */
export async function addManualExample(
  projectId: string,
  data: {
    title?: string;
    body_md: string;
    promptContext: Record<string, unknown>;
    personaId?: string;
    subredditId?: string;
    qualityScore?: number;
    userRating?: number;
    redditScore?: number;
  }
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data: result, error } = await (supabase
    .from('prompt_examples') as any)
    .insert({
      project_id: projectId,
      persona_id: data.personaId,
      subreddit_id: data.subredditId,
      prompt_context: data.promptContext,
      title: data.title,
      body_md: data.body_md,
      quality_score: data.qualityScore,
      user_rating: data.userRating,
      reddit_score: data.redditScore,
      is_curated: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error adding manual example:', error);
    return null;
  }

  return result?.id || null;
}

/**
 * Get learning stats for a project
 */
export async function getLearningStats(projectId: string) {
  const supabase = createAdminClient();

  // Get example counts
  const { count: totalExamples } = await supabase
    .from('prompt_examples')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const { count: curatedExamples } = await supabase
    .from('prompt_examples')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_curated', true);

  // Get recent metrics (skip RPC call since function may not exist)
  const { data: recentMetrics } = await supabase
    .from('learning_metrics')
    .select('*')
    .eq('project_id', projectId)
    .order('period_end', { ascending: false })
    .limit(4);

  return {
    totalExamples: totalExamples || 0,
    curatedExamples: curatedExamples || 0,
    contentStats: {},
    recentMetrics: recentMetrics || [],
  };
}

