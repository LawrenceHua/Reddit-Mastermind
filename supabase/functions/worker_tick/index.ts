// Supabase Edge Function for processing jobs
// Deploy with: supabase functions deploy worker_tick
// Schedule with pg_cron to run every minute

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const MAX_JOBS_PER_TICK = 5;
const LOCK_TIMEOUT_MS = 300000; // 5 minutes

// ============================================
// Types
// ============================================

interface Job {
  id: string;
  org_id: string;
  project_id: string;
  job_type: 'generate_week' | 'generate_item' | 'publish_item' | 'ingest_metrics';
  payload_json: Record<string, unknown>;
  status: string;
  attempts: number;
  last_error: string | null;
}

interface GenerateWeekPayload {
  week_start_date: string;
  calendar_week_id: string;
  generation_run_id: string;
  posts_per_week: number;
}

interface GenerateItemPayload {
  calendar_item_id: string;
  generation_run_id: string;
}

interface Persona {
  id: string;
  name: string;
  bio: string | null;
  tone: string | null;
  expertise_tags: string[];
  disclosure_rules_json: Record<string, unknown>;
}

interface Subreddit {
  id: string;
  name: string;
  risk_level: 'low' | 'medium' | 'high';
  max_posts_per_week: number;
  rules_text: string | null;
}

interface TopicSeed {
  id: string;
  seed_type: string;
  text: string;
  tags: string[];
  priority: number;
}

interface PostSlot {
  index: number;
  scheduledAt: Date;
  subredditId?: string;
  personaId?: string;
}

// ============================================
// Seeded Random (deterministic)
// ============================================

class SeededRandom {
  private seed: number;

  constructor(seedValue: string | number) {
    this.seed = typeof seedValue === 'string' ? this.stringToSeed(seedValue) : seedValue;
  }

  private stringToSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  choice<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ============================================
// OpenAI Client
// ============================================

async function generateWithOpenAI(
  prompt: string,
  apiKey: string
): Promise<{ content: string; success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that always responds with valid JSON matching the requested schema. Never include markdown code blocks or any text outside the JSON object.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { content: '', success: false, error: `OpenAI API error: ${errorBody}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return { content: '', success: false, error: 'No content in response' };
    }

    return { content, success: true };
  } catch (error) {
    return { content: '', success: false, error: `OpenAI request failed: ${error.message}` };
  }
}

// ============================================
// Slot Building
// ============================================

function buildPostSlots(
  weekStart: Date,
  postsPerWeek: number,
  seed: string
): PostSlot[] {
  const rng = new SeededRandom(seed);
  const slots: PostSlot[] = [];

  // Distribute posts across Mon-Fri
  const days = [0, 1, 2, 3, 4]; // Mon-Fri offsets
  const postsPerDay = Math.ceil(postsPerWeek / 5);

  let slotIndex = 0;
  for (const dayOffset of days) {
    if (slotIndex >= postsPerWeek) break;

    const dayPosts = Math.min(postsPerDay, postsPerWeek - slotIndex);
    for (let i = 0; i < dayPosts; i++) {
      // Random hour between 9-17
      const hour = 9 + Math.floor(rng.next() * 8);
      const minute = Math.floor(rng.next() * 60);

      const scheduledAt = new Date(weekStart);
      scheduledAt.setDate(scheduledAt.getDate() + dayOffset);
      scheduledAt.setHours(hour, minute, 0, 0);

      slots.push({
        index: slotIndex,
        scheduledAt,
      });
      slotIndex++;
    }
  }

  return slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

// ============================================
// Assignment Functions
// ============================================

function assignSubreddits(
  slots: PostSlot[],
  subreddits: Subreddit[],
  riskTolerance: string,
  seed: string
): PostSlot[] {
  const rng = new SeededRandom(seed + '-subreddits');
  const counts = new Map<string, number>();
  subreddits.forEach(s => counts.set(s.id, 0));

  // Filter by risk tolerance
  const allowedRisk = riskTolerance === 'low' ? ['low'] :
                      riskTolerance === 'medium' ? ['low', 'medium'] :
                      ['low', 'medium', 'high'];
  const eligibleSubreddits = subreddits.filter(s => allowedRisk.includes(s.risk_level));

  return slots.map(slot => {
    // Find eligible subreddits that haven't hit their cap
    const available = eligibleSubreddits.filter(s => {
      const currentCount = counts.get(s.id) || 0;
      return currentCount < s.max_posts_per_week;
    });

    if (available.length === 0) {
      // Fallback: use any subreddit
      const sub = rng.choice(eligibleSubreddits);
      counts.set(sub.id, (counts.get(sub.id) || 0) + 1);
      return { ...slot, subredditId: sub.id };
    }

    const sub = rng.choice(available);
    counts.set(sub.id, (counts.get(sub.id) || 0) + 1);
    return { ...slot, subredditId: sub.id };
  });
}

function assignPersonas(
  slots: PostSlot[],
  personas: Persona[],
  seed: string
): PostSlot[] {
  const rng = new SeededRandom(seed + '-personas');
  const lastUsed = new Map<string, Date>();

  return slots.map(slot => {
    // Filter personas that haven't been used in last 24h
    const available = personas.filter(p => {
      const last = lastUsed.get(p.id);
      if (!last) return true;
      const hoursSince = (slot.scheduledAt.getTime() - last.getTime()) / (1000 * 60 * 60);
      return hoursSince >= 24;
    });

    const persona = available.length > 0 ? rng.choice(available) : rng.choice(personas);
    lastUsed.set(persona.id, slot.scheduledAt);
    return { ...slot, personaId: persona.id };
  });
}

// ============================================
// Content Generation
// ============================================

function buildPostPrompt(context: {
  companyProfile: { name: string; description: string; website?: string };
  persona: Persona;
  subreddit: Subreddit;
  topicSeed: TopicSeed;
}): string {
  const disclosureRequired = context.persona.disclosure_rules_json?.required === true;
  const disclosureInstruction = disclosureRequired
    ? `IMPORTANT: This persona requires disclosure. Include a natural disclosure in the post indicating affiliation with ${context.companyProfile.name}. Set disclosure_used to the disclosure text you included.`
    : 'No disclosure is required for this persona. Set disclosure_used to null.';

  return `Generate a Reddit post for r/${context.subreddit.name}.

COMPANY CONTEXT:
- Name: ${context.companyProfile.name}
- Description: ${context.companyProfile.description}
${context.companyProfile.website ? `- Website: ${context.companyProfile.website}` : ''}

PERSONA:
- Name: ${context.persona.name}
${context.persona.bio ? `- Bio: ${context.persona.bio}` : ''}
${context.persona.tone ? `- Tone: ${context.persona.tone}` : ''}

SUBREDDIT RULES:
${context.subreddit.rules_text ?? 'No specific rules provided - follow standard Reddit etiquette.'}

TOPIC/ANGLE:
Type: ${context.topicSeed.seed_type}
Content: ${context.topicSeed.text}

${disclosureInstruction}

REQUIREMENTS:
1. The post must be VALUE-FIRST - genuinely helpful to the subreddit community
2. Do NOT include obvious promotional language or CTAs
3. Write naturally as a real person would
4. The title should be engaging but not clickbait
5. Keep the tone consistent with the persona
6. If mentioning the company/product, it should feel natural and contextual
7. Flag any potential risks in the risk_flags array

RESPOND WITH VALID JSON:
{
  "post": {
    "title": "string - the post title",
    "body_md": "string - the post body in markdown",
    "topic_cluster_key": "string - a unique key identifying this topic",
    "target_query_tags": ["array", "of", "relevant", "search", "terms"],
    "risk_flags": ["array", "of", "risk", "flags"],
    "disclosure_used": "string or null"
  },
  "op_followup_comment": {
    "body_md": "string - optional follow-up comment"
  } OR null
}`;
}

function buildScorePrompt(
  post: { title: string; body_md: string },
  subredditName: string,
  rulesText: string | null
): string {
  return `Score this Reddit post for r/${subredditName} on a scale of 0-10 for each dimension.

POST TITLE: ${post.title}

POST BODY:
${post.body_md}

SUBREDDIT RULES:
${rulesText ?? 'No specific rules provided.'}

SCORING DIMENSIONS:
1. subreddit_fit: How well does this post fit the subreddit's culture and rules?
2. helpfulness: How useful/valuable is this content to readers?
3. authenticity: Does this sound like a genuine person sharing knowledge, not marketing?
4. compliance_safety: Is this free of manipulation, spam, or policy violations?
5. brand_subtlety: If there's any brand mention, is it natural and value-first?
6. overall: Overall quality score

RESPOND WITH VALID JSON:
{
  "subreddit_fit": 0-10,
  "helpfulness": 0-10,
  "authenticity": 0-10,
  "compliance_safety": 0-10,
  "brand_subtlety": 0-10,
  "overall": 0-10,
  "reasoning": "Brief explanation of the scores"
}`;
}

// ============================================
// Job Processors
// ============================================

async function processGenerateWeek(
  supabase: SupabaseClient,
  payload: GenerateWeekPayload
): Promise<{ success: boolean; error?: string; data?: Record<string, unknown> }> {
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

    const project = week.projects as Record<string, unknown>;

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

    // Delete existing items for idempotency
    await supabase
      .from('calendar_items')
      .delete()
      .eq('calendar_week_id', payload.calendar_week_id);

    // Build and assign slots
    const weekStart = new Date(payload.week_start_date);
    let slots = buildPostSlots(weekStart, payload.posts_per_week, payload.calendar_week_id);
    slots = assignSubreddits(slots, subredditsData, project.risk_tolerance as string, payload.calendar_week_id);
    slots = assignPersonas(slots, personasData, payload.calendar_week_id);

    const companyProfile = project.company_profile_json as { name: string; description: string; website?: string };
    let successCount = 0;
    let errorCount = 0;

    // Generate content for each slot
    for (const slot of slots) {
      try {
        const subreddit = subredditsData.find(s => s.id === slot.subredditId)!;
        const persona = personasData.find(p => p.id === slot.personaId)!;
        const topicSeed = topicSeedsData[slot.index % topicSeedsData.length];

        // Generate post
        const postPrompt = buildPostPrompt({
          companyProfile: companyProfile || { name: 'Company', description: '' },
          persona,
          subreddit,
          topicSeed,
        });

        const postResult = await generateWithOpenAI(postPrompt, OPENAI_API_KEY);
        if (!postResult.success) {
          console.error(`Failed to generate post for slot ${slot.index}:`, postResult.error);
          errorCount++;
          continue;
        }

        let postData;
        try {
          postData = JSON.parse(postResult.content);
        } catch {
          console.error(`Invalid JSON for slot ${slot.index}`);
          errorCount++;
          continue;
        }

        // Score the post
        const scorePrompt = buildScorePrompt(postData.post, subreddit.name, subreddit.rules_text);
        const scoreResult = await generateWithOpenAI(scorePrompt, OPENAI_API_KEY);
        let scoreData = { overall: 5, subreddit_fit: 5, helpfulness: 5, authenticity: 5, compliance_safety: 5, brand_subtlety: 5, reasoning: 'Scoring failed' };
        
        if (scoreResult.success) {
          try {
            scoreData = JSON.parse(scoreResult.content);
          } catch {
            console.error(`Invalid score JSON for slot ${slot.index}`);
          }
        }

        // Create calendar item
        const { data: calendarItem } = await supabase
          .from('calendar_items')
          .insert({
            calendar_week_id: payload.calendar_week_id,
            scheduled_at: slot.scheduledAt.toISOString(),
            subreddit_id: slot.subredditId,
            primary_persona_id: slot.personaId,
            status: 'draft',
            topic_cluster_key: postData.post.topic_cluster_key,
            risk_flags_json: postData.post.risk_flags || [],
          })
          .select('id')
          .single();

        if (calendarItem) {
          // Create content asset (post)
          const { data: asset } = await supabase
            .from('content_assets')
            .insert({
              calendar_item_id: calendarItem.id,
              asset_type: 'post',
              author_persona_id: slot.personaId,
              title: postData.post.title,
              body_md: postData.post.body_md,
              metadata_json: {
                target_query_tags: postData.post.target_query_tags,
                disclosure_used: postData.post.disclosure_used,
                thread_role: 'op',
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
                subreddit_fit: scoreData.subreddit_fit,
                helpfulness: scoreData.helpfulness,
                authenticity: scoreData.authenticity,
                compliance_safety: scoreData.compliance_safety,
                brand_subtlety: scoreData.brand_subtlety,
              },
              overall_score: scoreData.overall,
              rater: 'llm',
              notes: scoreData.reasoning,
            });
          }

          // Create follow-up comment if present
          if (postData.op_followup_comment?.body_md) {
            await supabase.from('content_assets').insert({
              calendar_item_id: calendarItem.id,
              asset_type: 'followup',
              author_persona_id: slot.personaId,
              title: null,
              body_md: postData.op_followup_comment.body_md,
              metadata_json: {
                thread_role: 'op',
                offset_minutes_from_post: 60,
              },
              version: 1,
              status: 'active',
            });
          }
        }

        successCount++;
      } catch (error) {
        console.error(`Error generating slot ${slot.index}:`, error);
        errorCount++;
      }
    }

    // Update generation run status
    const finalStatus = errorCount === slots.length ? 'failed' : 'succeeded';
    await supabase
      .from('generation_runs')
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        error: errorCount > 0 ? `${errorCount} slots failed` : null,
      })
      .eq('id', payload.generation_run_id);

    return {
      success: true,
      data: { slots_generated: successCount, slots_failed: errorCount },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

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

async function processGenerateItem(
  supabase: SupabaseClient,
  payload: GenerateItemPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get calendar item with context
    const { data: item } = await supabase
      .from('calendar_items')
      .select(`
        *,
        calendar_weeks(project_id, projects(*)),
        subreddits(*),
        personas:primary_persona_id(*)
      `)
      .eq('id', payload.calendar_item_id)
      .single();

    if (!item) {
      throw new Error('Calendar item not found');
    }

    // Archive existing active assets
    await supabase
      .from('content_assets')
      .update({ status: 'archived' })
      .eq('calendar_item_id', payload.calendar_item_id)
      .eq('status', 'active');

    // Get a topic seed
    const week = item.calendar_weeks as { project_id: string; projects: Record<string, unknown> };
    const { data: topicSeeds } = await supabase
      .from('topic_seeds')
      .select('*')
      .eq('project_id', week.project_id)
      .eq('active', true)
      .order('priority', { ascending: false })
      .limit(1);

    const topicSeed = topicSeeds?.[0];
    if (!topicSeed) {
      throw new Error('No topic seeds available');
    }

    const project = week.projects;
    const companyProfile = project.company_profile_json as { name: string; description: string };
    const subreddit = item.subreddits as Subreddit;
    const persona = item.personas as Persona;

    // Generate new content
    const postPrompt = buildPostPrompt({
      companyProfile: companyProfile || { name: 'Company', description: '' },
      persona,
      subreddit,
      topicSeed,
    });

    const postResult = await generateWithOpenAI(postPrompt, OPENAI_API_KEY);
    if (!postResult.success) {
      throw new Error(postResult.error);
    }

    const postData = JSON.parse(postResult.content);

    // Get current max version
    const { data: versions } = await supabase
      .from('content_assets')
      .select('version')
      .eq('calendar_item_id', payload.calendar_item_id)
      .order('version', { ascending: false })
      .limit(1);

    const newVersion = ((versions?.[0]?.version as number) || 0) + 1;

    // Create new asset
    const { data: asset } = await supabase
      .from('content_assets')
      .insert({
        calendar_item_id: payload.calendar_item_id,
        asset_type: 'post',
        author_persona_id: persona.id,
        title: postData.post.title,
        body_md: postData.post.body_md,
        metadata_json: {
          target_query_tags: postData.post.target_query_tags,
          disclosure_used: postData.post.disclosure_used,
        },
        version: newVersion,
        status: 'active',
      })
      .select('id')
      .single();

    // Update calendar item
    await supabase
      .from('calendar_items')
      .update({
        topic_cluster_key: postData.post.topic_cluster_key,
        risk_flags_json: postData.post.risk_flags || [],
        status: 'draft',
      })
      .eq('id', payload.calendar_item_id);

    // Update generation run
    await supabase
      .from('generation_runs')
      .update({
        status: 'succeeded',
        finished_at: new Date().toISOString(),
      })
      .eq('id', payload.generation_run_id);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

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

// ============================================
// Main Handler
// ============================================

Deno.serve(async (req) => {
  // Verify authorization (optional - for extra security)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow service role calls and pg_cron calls (no auth header)
    // but reject unauthorized external calls if CRON_SECRET is set
    const isServiceCall = !authHeader; // pg_cron calls have no auth header
    if (!isServiceCall) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const workerId = `edge-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    let processed = 0;
    let errors = 0;
    const results: Array<{ job_id: string; type: string; success: boolean; error?: string }> = [];

    // Clean up stale locks first
    await supabase.rpc('cleanup_stale_job_locks', { lock_timeout_ms: LOCK_TIMEOUT_MS });

    for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
      // Claim next job
      const { data: jobs, error: claimError } = await supabase.rpc('claim_next_job', {
        worker_id: workerId,
        lock_timeout_ms: LOCK_TIMEOUT_MS,
      });

      if (claimError) {
        console.error('Failed to claim job:', claimError);
        break;
      }

      if (!jobs || jobs.length === 0) {
        break; // No more jobs
      }

      const job = jobs[0] as Job;

      try {
        // Update to running with incremented attempts
        const newAttempts = job.attempts + 1;
        await supabase
          .from('jobs')
          .update({
            status: 'running',
            attempts: newAttempts,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Process job based on type
        let result: { success: boolean; error?: string; data?: Record<string, unknown> };

        switch (job.job_type) {
          case 'generate_week':
            result = await processGenerateWeek(supabase, job.payload_json as GenerateWeekPayload);
            break;

          case 'generate_item':
            result = await processGenerateItem(supabase, job.payload_json as GenerateItemPayload);
            break;

          case 'publish_item':
            // Stub: would integrate with Reddit API
            result = { success: true };
            break;

          case 'ingest_metrics':
            // Stub: would fetch Reddit metrics
            result = { success: true };
            break;

          default:
            result = { success: false, error: `Unknown job type: ${job.job_type}` };
        }

        // Update job status
        await supabase
          .from('jobs')
          .update({
            status: result.success ? 'succeeded' : 'failed',
            last_error: result.error || null,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        if (result.success) {
          processed++;
        } else {
          errors++;
        }

        results.push({
          job_id: job.id,
          type: job.job_type,
          success: result.success,
          error: result.error,
        });
      } catch (err) {
        // Handle job processing error
        const shouldRetry = job.attempts < 3;
        await supabase
          .from('jobs')
          .update({
            status: shouldRetry ? 'queued' : 'failed',
            last_error: err.message,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        errors++;
        results.push({
          job_id: job.id,
          type: job.job_type,
          success: false,
          error: err.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        errors,
        worker_id: workerId,
        results,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Worker tick error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
