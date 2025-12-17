import { createAdminClient } from '@/lib/supabase/server';
import { buildPostSlots, assignSubreddits, assignPersonas } from '@/lib/planner';
import { generateCandidatesForSlot, DEFAULT_GENERATION_CONFIG } from '@/lib/generation';
import type { JobResult, GenerateWeekPayload, GenerateItemPayload } from './types';
import type { Subreddit, Persona, TopicSeed, SlotConstraints } from '@/lib/planner';

/**
 * Process a generate_week job
 */
export async function processGenerateWeekJob(payload: GenerateWeekPayload): Promise<JobResult> {
  const supabase = createAdminClient();

  try {
    // Update generation run to running
    await supabase
      .from('generation_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', payload.generation_run_id);

    // Get calendar week with project info
    const { data: week, error: weekError } = await supabase
      .from('calendar_weeks')
      .select('*, projects(*)')
      .eq('id', payload.calendar_week_id)
      .single();

    if (weekError || !week) {
      throw new Error(`Calendar week not found: ${weekError?.message}`);
    }

    const project = week.projects as unknown as {
      id: string;
      org_id: string;
      company_profile_json: Record<string, unknown>;
      brand_voice_json: Record<string, unknown>;
      risk_tolerance: 'low' | 'medium' | 'high';
    };

    // Get active personas
    const { data: personasData } = await supabase
      .from('personas')
      .select('*')
      .eq('project_id', project.id)
      .eq('active', true);

    // Get subreddits
    const { data: subredditsData } = await supabase
      .from('subreddits')
      .select('*')
      .eq('project_id', project.id);

    // Get active topic seeds
    const { data: topicSeedsData } = await supabase
      .from('topic_seeds')
      .select('*')
      .eq('project_id', project.id)
      .eq('active', true)
      .order('priority', { ascending: false });

    if (!personasData?.length || !subredditsData?.length || !topicSeedsData?.length) {
      throw new Error('Missing required data: personas, subreddits, or topic seeds');
    }

    // Transform to planner types
    const personas: Persona[] = personasData.map((p) => ({
      id: p.id,
      name: p.name,
      bio: p.bio,
      tone: p.tone,
      expertiseTags: p.expertise_tags || [],
      disclosureRequired: (p.disclosure_rules_json as Record<string, unknown>)?.required === true,
    }));

    const subreddits: Subreddit[] = subredditsData.map((s) => ({
      id: s.id,
      name: s.name,
      riskLevel: s.risk_level,
      maxPostsPerWeek: s.max_posts_per_week,
      allowedPostTypes: (s.allowed_post_types_json as string[]) || ['text'],
      rulesText: s.rules_text,
    }));

    const topicSeeds: TopicSeed[] = topicSeedsData.map((t) => ({
      id: t.id,
      seedType: t.seed_type,
      text: t.text,
      tags: t.tags || [],
      priority: t.priority,
    }));

    // Build slots
    const weekStartDate = new Date(payload.week_start_date);
    const slots = buildPostSlots(weekStartDate, payload.posts_per_week, payload.calendar_week_id);

    // Assign subreddits
    const constraints: SlotConstraints = {
      maxPostsPerSubreddit: new Map(subreddits.map((s) => [s.id, s.maxPostsPerWeek])),
      subredditRiskLevels: new Map(subreddits.map((s) => [s.id, s.riskLevel])),
      personaSpacingHours: 24,
      riskTolerance: project.risk_tolerance,
    };

    const withSubreddits = assignSubreddits(
      slots,
      subreddits,
      constraints,
      payload.calendar_week_id
    );

    // Assign personas
    const withPersonas = assignPersonas(
      withSubreddits.slots,
      personas,
      24,
      payload.calendar_week_id
    );

    // Get OpenAI API key from env
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Generate content for each slot
    let successCount = 0;
    let errorCount = 0;

    for (const slot of withPersonas.slots) {
      try {
        const subreddit = subreddits.find((s) => s.id === slot.subredditId)!;
        const persona = personas.find((p) => p.id === slot.personaId)!;
        // Cycle through topic seeds
        const topicSeed = topicSeeds[slot.index % topicSeeds.length];

        const companyProfile = project.company_profile_json as {
          name: string;
          description: string;
          website?: string;
        };

        const result = await generateCandidatesForSlot(
          {
            slot,
            subreddit,
            persona,
            topicSeed,
            companyProfile: companyProfile || { name: 'Company', description: '' },
            brandVoice: project.brand_voice_json || {},
          },
          apiKey,
          DEFAULT_GENERATION_CONFIG
        );

        if (result.selectedCandidate) {
          // Create calendar item
          const { data: calendarItem } = await supabase
            .from('calendar_items')
            .insert({
              calendar_week_id: payload.calendar_week_id,
              scheduled_at: slot.scheduledAt.toISOString(),
              subreddit_id: slot.subredditId,
              primary_persona_id: slot.personaId,
              status: 'draft',
              topic_cluster_key: result.selectedCandidate.candidate.post.topic_cluster_key,
              risk_flags_json: result.selectedCandidate.validationFlags,
            })
            .select('id')
            .single();

          if (calendarItem) {
            // Create content asset
            const { data: asset } = await supabase
              .from('content_assets')
              .insert({
                calendar_item_id: calendarItem.id,
                asset_type: 'post',
                author_persona_id: slot.personaId,
                title: result.selectedCandidate.candidate.post.title,
                body_md: result.selectedCandidate.candidate.post.body_md,
                metadata_json: {
                  target_query_tags: result.selectedCandidate.candidate.post.target_query_tags,
                  disclosure_used: result.selectedCandidate.candidate.post.disclosure_used,
                },
                version: 1,
                status: 'active',
              })
              .select('id')
              .single();

            // Create quality score
            if (asset) {
              await supabase.from('quality_scores').insert({
                asset_id: asset.id,
                dimensions_json: {
                  subreddit_fit: result.selectedCandidate.score.subreddit_fit,
                  helpfulness: result.selectedCandidate.score.helpfulness,
                  authenticity: result.selectedCandidate.score.authenticity,
                  compliance_safety: result.selectedCandidate.score.compliance_safety,
                  brand_subtlety: result.selectedCandidate.score.brand_subtlety,
                },
                overall_score: result.selectedCandidate.score.overall,
                rater: 'llm',
                notes: result.selectedCandidate.score.reasoning,
              });
            }

            // Create follow-up comment if present
            if (result.selectedCandidate.candidate.op_followup_comment && calendarItem) {
              await supabase.from('content_assets').insert({
                calendar_item_id: calendarItem.id,
                asset_type: 'followup',
                author_persona_id: slot.personaId,
                title: null,
                body_md: result.selectedCandidate.candidate.op_followup_comment.body_md,
                metadata_json: {},
                version: 1,
                status: 'active',
              });
            }
          }

          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error generating slot ${slot.index}:`, error);
        errorCount++;
      }
    }

    // Update generation run to succeeded
    await supabase
      .from('generation_runs')
      .update({
        status: errorCount === withPersonas.slots.length ? 'failed' : 'succeeded',
        finished_at: new Date().toISOString(),
        error: errorCount > 0 ? `${errorCount} slots failed` : null,
      })
      .eq('id', payload.generation_run_id);

    return {
      success: true,
      data: {
        slots_generated: successCount,
        slots_failed: errorCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Update generation run to failed
    await supabase
      .from('generation_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq('id', payload.generation_run_id);

    return { success: false, error: message };
  }
}

/**
 * Process a generate_item job (regeneration)
 */
export async function processGenerateItemJob(payload: GenerateItemPayload): Promise<JobResult> {
  // Similar to generate_week but for a single item
  // Implementation would be similar but focused on one calendar_item
  return {
    success: true,
    data: { message: 'Item regenerated (stub)' },
  };
}
