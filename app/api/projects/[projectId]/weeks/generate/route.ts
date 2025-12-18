import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startOfWeek, addWeeks, addDays, setHours, setMinutes, addMinutes } from 'date-fns';
import { z } from 'zod';
import type { Tables } from '@/lib/database.types';
import { buildThreadPlan, type ThreadSlot } from '@/lib/planner';
import { getTopExamples, buildFewShotSection } from '@/lib/learning';

const GenerateWeekSchema = z.object({
  week_start_date: z.string().optional(),
  posts_per_week: z.number().min(1).max(20).optional(),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Simple seeded random for deterministic scheduling
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// Check for overposting in same subreddit on same day
function checkOverposting(
  existingSlots: Array<{ subredditId: string; scheduledAt: Date }>,
  newSubredditId: string,
  newScheduledAt: Date,
  maxPerDayPerSubreddit: number = 1
): boolean {
  const newDay = newScheduledAt.toISOString().split('T')[0];
  const sameSubredditSameDay = existingSlots.filter(
    (s) =>
      s.subredditId === newSubredditId &&
      s.scheduledAt.toISOString().split('T')[0] === newDay
  );
  return sameSubredditSameDay.length >= maxPerDayPerSubreddit;
}

// Check for persona spacing - same persona shouldn't post back-to-back
function checkPersonaSpacing(
  existingSlots: Array<{ personaId: string; scheduledAt: Date }>,
  newPersonaId: string,
  newScheduledAt: Date,
  minHoursBetween: number = 4
): boolean {
  const minMs = minHoursBetween * 60 * 60 * 1000;
  return existingSlots.some(
    (s) =>
      s.personaId === newPersonaId &&
      Math.abs(newScheduledAt.getTime() - s.scheduledAt.getTime()) < minMs
  );
}

async function callOpenAI(
  prompt: string,
  systemPrompt: string
): Promise<{ content: string; success: boolean; error?: string }> {
  if (!OPENAI_API_KEY) {
    return { content: '', success: false, error: 'No OpenAI API key' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { content: '', success: false, error: errText };
    }

    const data = await response.json();
    return { content: data.choices[0].message.content, success: true };
  } catch (error) {
    return { content: '', success: false, error: String(error) };
  }
}

async function generatePostContent(
  companyInfo: any,
  persona: Tables<'personas'>,
  subreddit: Tables<'subreddits'>,
  topicSeed: Tables<'topic_seeds'> | null,
  projectId?: string
): Promise<{ title: string; body: string; riskFlags: string[] }> {
  if (!OPENAI_API_KEY) {
    return {
      title: `Discussion about ${topicSeed?.text || 'your industry'}`,
      body: `This is a placeholder post for ${subreddit.name}. Add your OPENAI_API_KEY to generate real content.`,
      riskFlags: [],
    };
  }

  // Get few-shot examples from past high-performing content
  let fewShotSection = '';
  if (projectId) {
    try {
      const examples = await getTopExamples(projectId, {
        limit: 3,
        minRating: 4,
        subredditId: subreddit.id,
      });
      fewShotSection = buildFewShotSection(examples, 'post');
    } catch (error) {
      console.log('[Generate] Could not fetch few-shot examples:', error);
    }
  }

  // VALUE-FIRST prompt - posts should be genuine questions, NOT promotional
  const prompt = `You are ${persona.name}, a real Reddit user asking a genuine question.

YOUR BACKGROUND:
${persona.bio || 'An engaged community member looking for advice.'}

YOUR TONE:
${persona.tone || 'Casual, authentic, like a real person asking for help.'}

SUBREDDIT: r/${subreddit.name.replace('r/', '')}
${subreddit.rules_text ? `Rules: ${subreddit.rules_text}` : ''}

TOPIC TO ADDRESS:
${topicSeed?.text || 'Ask for recommendations or advice relevant to this community.'}
${fewShotSection}
CRITICAL RULES FOR THE POST:
1. This is a QUESTION post - you're asking the community for help/recommendations
2. DO NOT mention ${companyInfo?.name || 'any specific product'} in the post itself
3. Keep it SHORT - 1-3 sentences max, like a real Reddit question
4. Sound natural and casual - use "I'm" not "I am", etc.
5. The title should be a simple, direct question
6. NO promotional language, NO calls-to-action, NO links
7. Write like someone genuinely seeking advice, not a marketer

EXAMPLES OF GOOD POSTS:
- "Best AI Presentation Maker?" / "Just like it says in the title, what is the best AI Presentation Maker? I'm looking for something that makes high quality slides I can edit afterwards. Any help appreciated."
- "Slideforge VS Claude for slides?" / "Trying to figure out what's the best one for making presentations."
- "Tools for automating pitch decks?" / "I spend way too much time on slides. Anyone found a good tool that actually works?"

Respond in JSON:
{
  "title": "Your question title (short, direct)",
  "body": "1-3 sentences explaining what you need (casual, genuine)",
  "risk_flags": []
}`;

  const result = await callOpenAI(prompt, 'You write authentic Reddit questions. Keep posts SHORT and genuine - never promotional. Always respond with valid JSON.');
  
  if (!result.success) {
    return {
      title: `Discussion for ${subreddit.name}`,
      body: `Error generating content. Please try again.`,
      riskFlags: ['generation_error'],
    };
  }

  try {
    const content = JSON.parse(result.content);
    return {
      title: content.title || 'Untitled Post',
      body: content.body || 'Content generation failed.',
      riskFlags: content.risk_flags || [],
    };
  } catch {
    return {
      title: `Discussion for ${subreddit.name}`,
      body: `Error parsing AI response.`,
      riskFlags: ['parse_error'],
    };
  }
}

// Generate a comment for a thread
async function generateComment(
  opPost: { title: string; body: string },
  persona: Tables<'personas'>,
  subreddit: Tables<'subreddits'>,
  intent: string,
  priorComments: Array<{ personaName: string; body: string }> = [],
  companyInfo: any
): Promise<{ body: string; riskFlags: string[] }> {
  if (!OPENAI_API_KEY) {
    return {
      body: `This is a great point! ${intent === 'question' ? 'I was wondering about this too.' : 'Thanks for sharing.'}`,
      riskFlags: [],
    };
  }

  const companyName = companyInfo?.name || 'the tool';

  // Intent-specific instructions for natural comments
  const intentInstructions: Record<string, string> = {
    question: `Ask a follow-up question about the topic. Be curious, not promotional.`,
    counterpoint: `Offer a different perspective or compare to another approach. Keep it respectful.`,
    add_example: `Share your personal experience with ${companyName}. Be specific about what you liked. Example: "I've tried a bunch of tools. ${companyName} is the only one that doesn't make me fight the layout."`,
    clarify: `Ask for more details about what specifically OP needs.`,
    agree: `Express agreement briefly. Can be as simple as "+1 ${companyName}" or "Same here, I use ${companyName} too."`,
    personal_experience: `Share how you use the tool in your workflow. Be casual and specific.`,
    thanks: `Thank someone for their recommendation. Keep it brief and genuine.`,
  };

  const priorContext = priorComments.length > 0
    ? `\nPRIOR COMMENTS IN THREAD:\n${priorComments.map((c, i) => `${c.personaName}: "${c.body}"`).join('\n')}\n`
    : '';

  const prompt = `You are ${persona.name}, a real Reddit user commenting naturally.

YOUR BACKGROUND:
${persona.bio || 'An experienced user who has tried various tools.'}

YOUR TONE:
${persona.tone || 'Casual and helpful, like chatting with a friend.'}

THE POST YOU'RE COMMENTING ON:
Title: ${opPost.title}
Body: ${opPost.body}
${priorContext}
YOUR TASK: ${intentInstructions[intent] || 'Add value to the conversation naturally.'}

CRITICAL RULES:
1. Keep it SHORT - 1-2 sentences max for most comments
2. Sound like a REAL person, not a marketer
3. Use casual language: "I've tried", "lol", "honestly", "+1", etc.
4. If recommending ${companyName}, make it feel like a genuine personal experience
5. DO NOT use corporate language or CTAs
6. Vary your style - not every comment needs to be long
7. If intent is "agree", can be as simple as "+1 ${companyName}"

EXAMPLES OF GOOD COMMENTS:
- "I've tried a bunch of tools. ${companyName} is the only one that doesn't make me fight the layout. Still fix things after, but it's a decent starting point."
- "+1 ${companyName}"
- "Yea Claude's slide output always looks really funky lol"
- "Same here. Claude is fine for internal notes but for anything customer facing we end up using ${companyName}."
- "I hate picking fonts lol. ${companyName}'s defaults save my sanity."

Respond in JSON:
{
  "body": "Your SHORT, natural comment",
  "risk_flags": []
}`;

  const result = await callOpenAI(prompt, 'You write SHORT, authentic Reddit comments. Never sound like marketing. Always respond with valid JSON.');

  if (!result.success) {
    return { body: 'Great post! Thanks for sharing.', riskFlags: ['generation_error'] };
  }

  try {
    const content = JSON.parse(result.content);
    return { body: content.body, riskFlags: content.risk_flags || [] };
  } catch {
    return { body: 'Great point!', riskFlags: ['parse_error'] };
  }
}

// Generate OP reply to a comment
async function generateOpReply(
  opPost: { title: string; body: string },
  parentComment: { personaName: string; body: string },
  opPersona: Tables<'personas'>,
  intent: string
): Promise<{ body: string; riskFlags: string[] }> {
  if (!OPENAI_API_KEY) {
    return { body: 'Thanks for your comment! Great point.', riskFlags: [] };
  }

  const prompt = `You are ${opPersona.name}, the Original Poster, replying to a helpful comment.

YOUR POST:
Title: ${opPost.title}
${opPost.body}

COMMENT YOU'RE REPLYING TO (from ${parentComment.personaName}):
"${parentComment.body}"

TASK: Write a SHORT, grateful reply as the OP.

CRITICAL RULES:
1. Keep it VERY short - 1 sentence max
2. Sound genuinely grateful and casual
3. Use phrases like "Sweet!", "Thanks!", "I'll check it out!", "Awesome, appreciate it!"
4. Don't over-explain or add unnecessary detail
5. Sound like a real person, not formal

EXAMPLES OF GOOD OP REPLIES:
- "Sweet I'll check it out!!"
- "Thanks! Exactly what I was looking for."
- "Awesome, appreciate the rec!"
- "Nice, will give it a try 👍"

Respond in JSON:
{
  "body": "Your SHORT reply (1 sentence)",
  "risk_flags": []
}`;

  const result = await callOpenAI(prompt, 'You write SHORT, genuine Reddit replies. One sentence max. Always respond with valid JSON.');

  if (!result.success) {
    return { body: 'Thanks for your input!', riskFlags: ['generation_error'] };
  }

  try {
    const content = JSON.parse(result.content);
    return { body: content.body, riskFlags: content.risk_flags || [] };
  } catch {
    return { body: 'Thanks!', riskFlags: ['parse_error'] };
  }
}

// Calculate quality score heuristically based on Maddie's criteria
function calculateQualityScore(content: { title?: string; body: string; riskFlags: string[] }): number {
  let score = 7.0;
  const body = content.body.toLowerCase();

  // === LENGTH CHECKS ===
  // Posts should be concise but substantive
  if (content.body.length < 50) score -= 2; // Too short
  else if (content.body.length >= 50 && content.body.length <= 300) score += 0.5; // Ideal length
  else if (content.body.length > 500) score -= 0.5; // Getting long
  else if (content.body.length > 1000) score -= 1; // Too long for Reddit

  // === TITLE CHECKS ===
  if (content.title) {
    const title = content.title.toLowerCase();
    if (content.title.length < 10) score -= 1;
    if (content.title.length > 150) score -= 0.5;
    if (/[A-Z]{3,}/.test(content.title)) score -= 1; // ALL CAPS
    
    // Question titles are good for engagement
    if (content.title.includes('?')) score += 0.5;
  }

  // === NATURALNESS CHECKS ===
  // Casual language indicators (good)
  const casualIndicators = ['lol', 'tbh', 'imo', 'honestly', 'i\'ve', 'i\'m', 'thanks', 'awesome', 'sweet'];
  const casualCount = casualIndicators.filter(indicator => body.includes(indicator)).length;
  score += Math.min(casualCount * 0.3, 1); // Max +1 for casual language

  // === PROMOTIONAL RED FLAGS (bad) ===
  const promotionalPhrases = [
    'check out', 'visit our', 'click here', 'sign up', 'free trial',
    'discount', 'promo code', 'limited time', 'act now', 'don\'t miss',
    'best in class', 'industry leading', 'revolutionary', 'game changer'
  ];
  const promoCount = promotionalPhrases.filter(phrase => body.includes(phrase)).length;
  score -= promoCount * 1.5; // Heavy penalty for promotional language

  // === VALUE INDICATORS (good) ===
  // Sharing experience, asking questions, being helpful
  const valueIndicators = [
    'i\'ve tried', 'in my experience', 'what i found', 'hope this helps',
    'anyone else', 'has anyone', 'looking for', 'recommendations'
  ];
  const valueCount = valueIndicators.filter(indicator => body.includes(indicator)).length;
  score += Math.min(valueCount * 0.4, 1.5);

  // === RISK FLAGS PENALTY ===
  score -= content.riskFlags.length * 1;

  // === FINAL ADJUSTMENTS ===
  // Comments should be shorter than posts
  if (!content.title && content.body.length > 200) {
    score -= 0.5; // Comments should be brief
  }

  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();

    // Verify user authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get project and verify access
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*, orgs(*)')
      .eq('id', projectId)
      .single();

    if (projectError || !projectData) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projectData as Tables<'projects'> & { orgs: Tables<'orgs'> };
    const companyInfo = (project as any).company_profile_json;

    // Get personas and subreddits
    const [personasResult, subredditsResult, topicSeedsResult] = await Promise.all([
      supabase.from('personas').select('*').eq('project_id', projectId).eq('active', true),
      supabase.from('subreddits').select('*').eq('project_id', projectId),
      supabase.from('topic_seeds').select('*').eq('project_id', projectId).eq('active', true),
    ]);

    const personas = (personasResult.data || []) as Tables<'personas'>[];
    const subreddits = (subredditsResult.data || []) as Tables<'subreddits'>[];
    const topicSeeds = (topicSeedsResult.data || []) as Tables<'topic_seeds'>[];

    if (personas.length === 0) {
      return NextResponse.json({ error: 'No active personas found. Please add personas in Setup.' }, { status: 400 });
    }

    if (subreddits.length === 0) {
      return NextResponse.json({ error: 'No subreddits found. Please add subreddits in Setup.' }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const validatedBody = GenerateWeekSchema.parse(body);

    // Determine week start date
    let weekStartDate: Date;
    if (validatedBody.week_start_date) {
      weekStartDate = new Date(validatedBody.week_start_date);
    } else {
      // Default to next Monday
      const today = new Date();
      weekStartDate = startOfWeek(addWeeks(today, 1), { weekStartsOn: 0 });
    }

    const postsPerWeek = validatedBody.posts_per_week ?? project.posts_per_week;
    const weekStartStr = weekStartDate.toISOString().split('T')[0];

    // Check if week already exists
    const { data: existingWeekData } = await supabase
      .from('calendar_weeks')
      .select('id')
      .eq('project_id', projectId)
      .eq('week_start_date', weekStartStr)
      .single();

    let calendarWeekId: string;

    if (existingWeekData) {
      calendarWeekId = (existingWeekData as { id: string }).id;
      
      // Delete existing items for regeneration
      await supabase.from('calendar_items').delete().eq('calendar_week_id', calendarWeekId);
    } else {
      // Create new calendar week
      const { data: newWeekData, error: weekError } = await (supabase
        .from('calendar_weeks') as any)
        .insert({
          project_id: projectId,
          week_start_date: weekStartStr,
          status: 'draft',
        })
        .select('id')
        .single();

      if (weekError || !newWeekData) {
        return NextResponse.json({ error: 'Failed to create calendar week' }, { status: 500 });
      }

      calendarWeekId = (newWeekData as { id: string }).id;
    }

    // Create generation run
    const { data: runData, error: runError } = await (supabase
      .from('generation_runs') as any)
      .insert({
        project_id: projectId,
        run_type: 'week_gen',
        inputs_json: {
          week_start_date: weekStartStr,
          posts_per_week: postsPerWeek,
        },
        model_config_json: {
          model: 'gpt-4o',
          temperature: 0.8,
        },
        status: 'running',
      })
      .select('id')
      .single();

    if (runError || !runData) {
      return NextResponse.json({ error: 'Failed to create generation run' }, { status: 500 });
    }

    const run = runData as { id: string };

    // Update calendar week with generation run id
    await (supabase.from('calendar_weeks') as any)
      .update({ generation_run_id: run.id, status: 'draft' })
      .eq('id', calendarWeekId);

    // Generate calendar items with REAL AI content + thread replies
    try {
      const seed = new Date(weekStartStr).getTime();
      const existingSlots: Array<{ subredditId: string; personaId: string; scheduledAt: Date }> = [];
      
      console.log(`Generating ${postsPerWeek} posts with threads for week ${weekStartStr}...`);

      let totalAssetsCreated = 0;

      for (let i = 0; i < postsPerWeek; i++) {
        // Pick day (0-6, spread across week) with smarter distribution
        const dayOffset = Math.floor((i / postsPerWeek) * 7);
        const scheduledDate = addDays(weekStartDate, dayOffset);
        
        // Pick time (9 AM - 9 PM range)
        const hour = 9 + Math.floor(seededRandom(seed + i) * 12);
        const minute = Math.floor(seededRandom(seed + i + 1000) * 60);
        const scheduledTime = setMinutes(setHours(scheduledDate, hour), minute);

        // Pick subreddit - avoid overposting
        let subredditIndex = i % subreddits.length;
        let subreddit = subreddits[subredditIndex];
        let attempts = 0;
        while (checkOverposting(existingSlots, subreddit.id, scheduledTime) && attempts < subreddits.length) {
          subredditIndex = (subredditIndex + 1) % subreddits.length;
          subreddit = subreddits[subredditIndex];
          attempts++;
        }

        // Pick persona - ensure spacing
        let personaIndex = i % personas.length;
        let persona = personas[personaIndex];
        attempts = 0;
        while (checkPersonaSpacing(existingSlots, persona.id, scheduledTime) && attempts < personas.length) {
          personaIndex = (personaIndex + 1) % personas.length;
          persona = personas[personaIndex];
          attempts++;
        }

        const topicSeed = topicSeeds.length > 0 ? topicSeeds[i % topicSeeds.length] : null;

        console.log(`Generating post ${i + 1}/${postsPerWeek} for ${subreddit.name} by ${persona.name}...`);

        // Generate OP post content (with few-shot examples from high-performing past content)
        const postContent = await generatePostContent(companyInfo, persona, subreddit, topicSeed, projectId);

        // Create calendar item
        const { data: itemData, error: itemError } = await (supabase
          .from('calendar_items') as any)
          .insert({
            calendar_week_id: calendarWeekId,
            subreddit_id: subreddit.id,
            persona_id: persona.id,
            topic_seed_id: topicSeed?.id || null,
            scheduled_at: scheduledTime.toISOString(),
            status: 'draft',
            slot_index: i,
          })
          .select('id')
          .single();

        if (itemError || !itemData) {
          console.error('Error creating calendar item:', itemError);
          continue;
        }

        const itemId = (itemData as { id: string }).id;

        // Track for overposting/spacing checks
        existingSlots.push({
          subredditId: subreddit.id,
          personaId: persona.id,
          scheduledAt: scheduledTime,
        });

        // Create OP post content asset
        const postQualityScore = calculateQualityScore({
          title: postContent.title,
          body: postContent.body,
          riskFlags: postContent.riskFlags,
        });

        const { data: postAsset, error: postAssetError } = await (supabase.from('content_assets') as any)
          .insert({
            calendar_item_id: itemId,
            asset_type: 'post',
            author_persona_id: persona.id,
            version: 1,
            title: postContent.title,
            body_md: postContent.body,
            metadata_json: {
              generated_at: new Date().toISOString(),
              persona_name: persona.name,
              subreddit_name: subreddit.name,
              model: 'gpt-4o',
              thread_role: 'op',
              slot_index: 0,
              offset_minutes_from_post: 0,
              risk_flags: postContent.riskFlags,
              quality_score: postQualityScore,
            },
            status: 'draft',
          })
          .select('id')
          .single();

        if (postAssetError) {
          console.error('Error creating post asset:', postAssetError);
        }

        totalAssetsCreated++;

        // Store quality score
        if (postAsset) {
          await (supabase.from('quality_scores') as any).insert({
            content_asset_id: (postAsset as { id: string }).id,
            overall_score: postQualityScore,
            dimension_scores: {
              value: postQualityScore,
              authenticity: postQualityScore,
              engagement: postQualityScore,
            },
            flags: postContent.riskFlags,
            model_version: 'gpt-4o',
          });
        }

        // === THREAD GENERATION ===
        // Only generate thread if we have 2+ personas
        if (personas.length >= 2) {
          console.log(`  → Generating thread comments for post ${i + 1}...`);

          // Build thread plan
          const threadPlan = buildThreadPlan(
            itemId,
            persona.id,
            personas.map((p) => ({ id: p.id })),
            `${weekStartStr}-${i}`,
            {
              numCommenters: Math.min(2, personas.length - 1), // 2 comments max for speed
              numOpReplies: 1, // 1 OP reply
              minCommentSpacingMinutes: 15,
              earlyCommentWindowHours: 4,
              lateCommentWindowHours: 24,
              maxInternalPersonasPerThread: 2,
            }
          );

          const priorComments: Array<{ personaName: string; body: string; slotIndex: number }> = [];

          // Generate comments and replies
          for (const slot of threadPlan.slots) {
            if (slot.assetType === 'post') continue; // Already created

            const slotPersona = personas.find((p) => p.id === slot.personaId);
            if (!slotPersona) continue;

            const scheduledAt = addMinutes(scheduledTime, slot.offsetMinutes);

            if (slot.assetType === 'comment') {
              // Generate comment
              const commentContent = await generateComment(
                { title: postContent.title, body: postContent.body },
                slotPersona,
                subreddit,
                slot.intent || 'agree',
                priorComments.map((c) => ({ personaName: c.personaName, body: c.body })),
                companyInfo
              );

              const commentScore = calculateQualityScore({
                body: commentContent.body,
                riskFlags: commentContent.riskFlags,
              });

              const { error: commentError } = await (supabase.from('content_assets') as any).insert({
                calendar_item_id: itemId,
                asset_type: 'comment',
                author_persona_id: slotPersona.id,
                version: 1,
                title: null,
                body_md: commentContent.body,
                metadata_json: {
                  generated_at: new Date().toISOString(),
                  persona_name: slotPersona.name,
                  subreddit_name: subreddit.name,
                  model: 'gpt-4o',
                  thread_role: 'commenter',
                  slot_index: slot.index,
                  offset_minutes_from_post: slot.offsetMinutes,
                  scheduled_at: scheduledAt.toISOString(),
                  intent: slot.intent,
                  parent_slot_index: slot.parentSlotIndex,
                  risk_flags: commentContent.riskFlags,
                  quality_score: commentScore,
                },
                status: 'draft',
              });
              
              if (commentError) {
                console.error('Error creating comment:', commentError);
              }

              priorComments.push({
                personaName: slotPersona.name,
                body: commentContent.body,
                slotIndex: slot.index,
              });

              totalAssetsCreated++;
            } else if (slot.assetType === 'followup') {
              // OP reply to a comment
              const parentComment = priorComments.find((c) => c.slotIndex === slot.parentSlotIndex);
              if (!parentComment) continue;

              const replyContent = await generateOpReply(
                { title: postContent.title, body: postContent.body },
                { personaName: parentComment.personaName, body: parentComment.body },
                persona, // OP persona
                slot.intent || 'thanks'
              );

              const replyScore = calculateQualityScore({
                body: replyContent.body,
                riskFlags: replyContent.riskFlags,
              });

              const { error: replyError } = await (supabase.from('content_assets') as any).insert({
                calendar_item_id: itemId,
                asset_type: 'followup',
                author_persona_id: persona.id,
                version: 1,
                title: null,
                body_md: replyContent.body,
                metadata_json: {
                  generated_at: new Date().toISOString(),
                  persona_name: persona.name,
                  subreddit_name: subreddit.name,
                  model: 'gpt-4o',
                  thread_role: 'op',
                  slot_index: slot.index,
                  offset_minutes_from_post: slot.offsetMinutes,
                  scheduled_at: scheduledAt.toISOString(),
                  intent: slot.intent,
                  parent_slot_index: slot.parentSlotIndex,
                  risk_flags: replyContent.riskFlags,
                  quality_score: replyScore,
                },
                status: 'draft',
              });

              if (replyError) {
                console.error('Error creating reply:', replyError);
              }

              totalAssetsCreated++;
            }
          }
        }
      }

      // Update run status to completed
      console.log(`[Generate] Updating generation run ${run.id} to succeeded...`);
      const { error: runUpdateError } = await (supabase.from('generation_runs') as any)
        .update({ status: 'succeeded' })
        .eq('id', run.id);

      if (runUpdateError) {
        console.error('[Generate] Failed to update run status:', runUpdateError);
      } else {
        console.log(`[Generate] ✅ Run ${run.id} status updated to succeeded`);
      }

      // Update week status to draft (ready for review)
      const { error: weekUpdateError } = await (supabase.from('calendar_weeks') as any)
        .update({ status: 'draft' })
        .eq('id', calendarWeekId);

      if (weekUpdateError) {
        console.error('[Generate] Failed to update week status:', weekUpdateError);
      }

      console.log(`[Generate] ✅ Week generation complete! Created ${postsPerWeek} posts with ${totalAssetsCreated} total assets.`);

      return NextResponse.json({
        success: true,
        generation_run_id: run.id,
        calendar_week_id: calendarWeekId,
        week_start_date: weekStartStr,
        items_created: postsPerWeek,
        total_assets: totalAssetsCreated,
      });
    } catch (genError) {
      console.error('Generation error:', genError);
      
      // Update run status to failed
      await (supabase.from('generation_runs') as any)
        .update({ status: 'failed' })
        .eq('id', run.id);

      throw genError;
    }
  } catch (error) {
    console.error('Error in generate week:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
