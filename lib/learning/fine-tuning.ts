import { createAdminClient } from '@/lib/supabase/server';

interface TrainingExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Export training data in OpenAI fine-tuning format (JSONL)
 */
export async function exportTrainingData(
  projectId: string,
  options: {
    minRating?: number;
    onlyPosted?: boolean;
    limit?: number;
  } = {}
): Promise<{ jsonl: string; count: number }> {
  const supabase = createAdminClient();
  const { minRating = 4, onlyPosted = true, limit = 500 } = options;

  // Get high-quality content with full context
  let query = supabase
    .from('content_assets')
    .select(`
      id,
      title,
      body_md,
      asset_type,
      metadata_json,
      user_rating,
      reddit_score,
      calendar_items!inner(
        personas!inner(name, bio, tone),
        subreddits!inner(name, rules_text),
        topic_seeds(text),
        calendar_weeks!inner(
          projects!inner(
            id,
            company_profile_json
          )
        )
      )
    `)
    .gte('user_rating', minRating)
    .eq('calendar_items.calendar_weeks.project_id', projectId)
    .not('body_md', 'is', null)
    .order('user_rating', { ascending: false })
    .limit(limit);

  if (onlyPosted) {
    query = query.eq('was_posted', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error exporting training data:', error);
    return { jsonl: '', count: 0 };
  }

  const trainingExamples: TrainingExample[] = [];

  for (const rawAsset of (data || [])) {
    const asset = rawAsset as any;
    const item = asset.calendar_items;
    const persona = item?.personas;
    const subreddit = item?.subreddits;
    const topic = item?.topic_seeds;
    const project = item?.calendar_weeks?.projects;
    const companyInfo = project?.company_profile_json || {};

    // Build the prompt that would have been used
    const userPrompt = buildTrainingPrompt(
      asset.asset_type,
      persona,
      subreddit,
      topic,
      companyInfo,
      asset.metadata_json
    );

    // Build the expected response
    const assistantResponse = asset.asset_type === 'post'
      ? JSON.stringify({
          title: asset.title,
          body: asset.body_md,
          risk_flags: asset.metadata_json?.risk_flags || [],
        })
      : JSON.stringify({
          body: asset.body_md,
          risk_flags: asset.metadata_json?.risk_flags || [],
        });

    trainingExamples.push({
      messages: [
        {
          role: 'system',
          content: getSystemPrompt(asset.asset_type),
        },
        {
          role: 'user',
          content: userPrompt,
        },
        {
          role: 'assistant',
          content: assistantResponse,
        },
      ],
    });
  }

  // Convert to JSONL format
  const jsonl = trainingExamples.map((ex) => JSON.stringify(ex)).join('\n');

  return { jsonl, count: trainingExamples.length };
}

function getSystemPrompt(assetType: string): string {
  const prompts: Record<string, string> = {
    post: `You are an expert Reddit content writer. You create authentic, value-first posts that feel like genuine questions or discussions from real Reddit users. You never use promotional language or corporate speak. Your posts are concise (1-3 sentences), casual, and designed to spark genuine engagement. Always respond with valid JSON containing title, body, and risk_flags.`,

    comment: `You are an expert Reddit commenter. You write short, authentic comments that add value to discussions. Your comments feel like they come from a real person with genuine experience. You're helpful without being salesy. Comments are typically 1-2 sentences. Always respond with valid JSON containing body and risk_flags.`,

    followup: `You are the original poster replying to helpful comments. Your replies are brief, grateful, and genuine - like a real person saying thanks. Typical replies are just a few words to one sentence. Always respond with valid JSON containing body and risk_flags.`,
  };

  return prompts[assetType] || prompts.post;
}

function buildTrainingPrompt(
  assetType: string,
  persona: { name: string; bio: string; tone: string } | null,
  subreddit: { name: string; rules_text: string } | null,
  topic: { text: string } | null,
  companyInfo: { name?: string; description?: string },
  metadata: Record<string, unknown>
): string {
  const companyName = companyInfo.name || 'the product';

  if (assetType === 'post') {
    return `You are ${persona?.name || 'a Reddit user'}, asking a genuine question.

YOUR BACKGROUND:
${persona?.bio || 'An engaged community member looking for advice.'}

YOUR TONE:
${persona?.tone || 'Casual, authentic, like a real person.'}

SUBREDDIT: r/${subreddit?.name?.replace('r/', '') || 'relevant_subreddit'}
${subreddit?.rules_text ? `Rules: ${subreddit.rules_text}` : ''}

TOPIC TO ADDRESS:
${topic?.text || 'Ask for recommendations or advice.'}

Generate a genuine Reddit question post. DO NOT mention ${companyName} directly. Keep it SHORT (1-3 sentences). Sound like a real person.

Respond in JSON: { "title": "...", "body": "...", "risk_flags": [] }`;
  }

  if (assetType === 'comment') {
    const intent = metadata?.intent || 'add_example';
    const parentPost = metadata?.parent_post || { title: 'the original post', body: '' };

    return `You are ${persona?.name || 'a Reddit user'}, commenting naturally.

YOUR BACKGROUND:
${persona?.bio || 'An experienced user who has tried various tools.'}

YOUR TONE:
${persona?.tone || 'Casual and helpful.'}

THE POST YOU'RE COMMENTING ON:
Title: ${(parentPost as any).title}
${(parentPost as any).body ? `Body: ${(parentPost as any).body}` : ''}

YOUR TASK: ${getIntentInstruction(intent as string, companyName)}

Keep it SHORT (1-2 sentences). Sound like a REAL person, not a marketer.

Respond in JSON: { "body": "...", "risk_flags": [] }`;
  }

  // followup
  return `You are ${persona?.name || 'the OP'}, replying to a helpful comment.

Write a SHORT, grateful reply (1 sentence max). Sound genuine and casual.

Respond in JSON: { "body": "...", "risk_flags": [] }`;
}

function getIntentInstruction(intent: string, companyName: string): string {
  const instructions: Record<string, string> = {
    question: 'Ask a follow-up question about the topic.',
    counterpoint: 'Offer a different perspective.',
    add_example: `Share your experience with ${companyName}. Be specific about what you liked.`,
    clarify: 'Ask for more details.',
    agree: `Express agreement. Can be as simple as "+1 ${companyName}".`,
    personal_experience: 'Share how you use the tool.',
    thanks: 'Thank someone for their recommendation.',
  };

  return instructions[intent] || instructions.add_example;
}

/**
 * Get fine-tuning readiness assessment
 */
export async function assessFineTuningReadiness(projectId: string): Promise<{
  ready: boolean;
  totalExamples: number;
  minRequired: number;
  qualityBreakdown: Record<string, number>;
  recommendations: string[];
}> {
  const supabase = createAdminClient();
  const minRequired = 50; // OpenAI recommends 50-100 minimum

  // Get rated content counts
  const { data: stats } = await supabase
    .from('content_assets')
    .select('user_rating, was_posted')
    .not('user_rating', 'is', null)
    .eq('calendar_items.calendar_weeks.project_id', projectId);

  const qualityBreakdown: Record<string, number> = {
    '5_star': 0,
    '4_star': 0,
    '3_star': 0,
    '2_star': 0,
    '1_star': 0,
    'posted': 0,
  };

  (stats || []).forEach((s: any) => {
    const rating = s.user_rating;
    if (rating === 5) qualityBreakdown['5_star']++;
    else if (rating === 4) qualityBreakdown['4_star']++;
    else if (rating === 3) qualityBreakdown['3_star']++;
    else if (rating === 2) qualityBreakdown['2_star']++;
    else if (rating === 1) qualityBreakdown['1_star']++;
    if (s.was_posted) qualityBreakdown['posted']++;
  });

  const highQualityCount = qualityBreakdown['5_star'] + qualityBreakdown['4_star'];
  const recommendations: string[] = [];

  if (highQualityCount < minRequired) {
    recommendations.push(
      `Need ${minRequired - highQualityCount} more 4-5 star rated posts to enable fine-tuning.`
    );
  }

  if (qualityBreakdown['posted'] < minRequired / 2) {
    recommendations.push(
      'Mark more content as "posted" to improve training data quality.'
    );
  }

  if (qualityBreakdown['5_star'] < qualityBreakdown['4_star'] / 2) {
    recommendations.push(
      'Try to identify more 5-star exemplary content for better training.'
    );
  }

  return {
    ready: highQualityCount >= minRequired,
    totalExamples: highQualityCount,
    minRequired,
    qualityBreakdown,
    recommendations,
  };
}

/**
 * Validate training data before export
 */
export function validateTrainingData(jsonl: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = jsonl.split('\n').filter(Boolean);

  if (lines.length < 10) {
    errors.push(`Only ${lines.length} examples. OpenAI recommends at least 50.`);
  }

  const seenResponses = new Set<string>();

  lines.forEach((line, i) => {
    try {
      const example = JSON.parse(line);

      if (!example.messages || !Array.isArray(example.messages)) {
        errors.push(`Line ${i + 1}: Missing or invalid 'messages' array.`);
        return;
      }

      if (example.messages.length < 3) {
        errors.push(`Line ${i + 1}: Must have system, user, and assistant messages.`);
        return;
      }

      const assistantMsg = example.messages.find((m: any) => m.role === 'assistant');
      if (!assistantMsg) {
        errors.push(`Line ${i + 1}: Missing assistant message.`);
        return;
      }

      // Check for duplicate responses
      if (seenResponses.has(assistantMsg.content)) {
        warnings.push(`Line ${i + 1}: Duplicate assistant response detected.`);
      }
      seenResponses.add(assistantMsg.content);

      // Check response length
      if (assistantMsg.content.length < 20) {
        warnings.push(`Line ${i + 1}: Very short response (${assistantMsg.content.length} chars).`);
      }
    } catch (e) {
      errors.push(`Line ${i + 1}: Invalid JSON.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

