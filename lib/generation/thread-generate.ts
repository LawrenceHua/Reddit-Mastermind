/**
 * Thread Generation Module
 *
 * Generates content for entire threads including:
 * - OP post
 * - Comments from other personas
 * - OP replies to comments
 *
 * Uses contextual prompting where each comment/reply sees previous content.
 */

import { z } from 'zod';
import type { ThreadSlot, ThreadIntent } from '@/lib/planner/thread';

// ============================================
// Types
// ============================================

export interface ThreadGenerationContext {
  companyProfile: {
    name: string;
    description: string;
    website?: string;
  };
  subreddit: {
    name: string;
    rulesText: string | null;
  };
  topicSeed: {
    text: string;
    seedType: string;
  };
  personas: Map<
    string,
    {
      id: string;
      name: string;
      bio: string | null;
      tone: string | null;
      disclosureRequired: boolean;
    }
  >;
}

export interface GeneratedAsset {
  slotIndex: number;
  assetType: 'post' | 'comment' | 'followup';
  personaId: string;
  title: string | null;
  bodyMd: string;
  metadata: {
    threadRole: 'op' | 'commenter';
    offsetMinutesFromPost: number;
    intent: string | null;
    parentSlotIndex: number | null;
    topicClusterKey?: string;
    targetQueryTags?: string[];
    riskFlags?: string[];
    disclosureUsed?: string | null;
  };
}

export interface ThreadGenerationResult {
  success: boolean;
  assets: GeneratedAsset[];
  errors: string[];
}

// ============================================
// Zod Schemas for LLM Outputs
// ============================================

const PostOutputSchema = z.object({
  post: z.object({
    title: z.string(),
    body_md: z.string(),
    topic_cluster_key: z.string(),
    target_query_tags: z.array(z.string()),
    risk_flags: z.array(z.string()),
    disclosure_used: z.string().nullable(),
  }),
  op_followup_comment: z
    .object({
      body_md: z.string(),
    })
    .nullable(),
});

const CommentOutputSchema = z.object({
  comment: z.object({
    body_md: z.string(),
    risk_flags: z.array(z.string()),
  }),
});

const ReplyOutputSchema = z.object({
  reply: z.object({
    body_md: z.string(),
    risk_flags: z.array(z.string()),
  }),
});

// ============================================
// Prompt Builders
// ============================================

function buildPostPrompt(context: ThreadGenerationContext, opPersonaId: string): string {
  const persona = context.personas.get(opPersonaId)!;

  const disclosureInstruction = persona.disclosureRequired
    ? `IMPORTANT: This persona requires disclosure. Include a natural disclosure in the post indicating affiliation with ${context.companyProfile.name}. Set disclosure_used to the disclosure text you included.`
    : 'No disclosure is required for this persona. Set disclosure_used to null.';

  return `Generate a Reddit post for r/${context.subreddit.name}.

COMPANY CONTEXT:
- Name: ${context.companyProfile.name}
- Description: ${context.companyProfile.description}
${context.companyProfile.website ? `- Website: ${context.companyProfile.website}` : ''}

PERSONA (you are writing as this person):
- Name: ${persona.name}
${persona.bio ? `- Bio: ${persona.bio}` : ''}
${persona.tone ? `- Tone: ${persona.tone}` : ''}

SUBREDDIT RULES:
${context.subreddit.rulesText ?? 'No specific rules provided - follow standard Reddit etiquette.'}

TOPIC/ANGLE:
Type: ${context.topicSeed.seedType}
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
    "title": "string - engaging post title",
    "body_md": "string - post body in markdown",
    "topic_cluster_key": "string - unique topic identifier",
    "target_query_tags": ["relevant", "search", "terms"],
    "risk_flags": ["any", "risks", "detected"],
    "disclosure_used": "string or null"
  },
  "op_followup_comment": null
}`;
}

function getIntentDescription(intent: ThreadIntent): string {
  const descriptions: Record<ThreadIntent, string> = {
    question: 'Ask a genuine, thoughtful question about something in the post',
    counterpoint: 'Respectfully offer an alternative perspective or consideration',
    add_example: 'Share a relevant example, case study, or anecdote that adds value',
    clarify: 'Ask for clarification on a specific point in the post',
    agree: 'Express agreement and expand on why this resonates',
    personal_experience: 'Share a related personal experience that adds context',
    thanks: 'Express appreciation and mention what was most helpful',
  };
  return descriptions[intent] || 'Engage naturally with the content';
}

function buildCommentPrompt(
  context: ThreadGenerationContext,
  slot: ThreadSlot,
  opPost: { title: string; body_md: string },
  priorComments: Array<{ persona: string; body: string }>
): string {
  const persona = context.personas.get(slot.personaId)!;
  const intentDescription = slot.intent
    ? getIntentDescription(slot.intent)
    : 'Engage naturally with the content';

  const priorContext =
    priorComments.length > 0
      ? `
PRIOR COMMENTS IN THREAD:
${priorComments.map((c, i) => `Comment ${i + 1} by ${c.persona}:\n${c.body}`).join('\n\n')}
`
      : '';

  return `Generate a Reddit comment for r/${context.subreddit.name}.

THE POST YOU ARE COMMENTING ON:
Title: ${opPost.title}

${opPost.body_md}
${priorContext}
PERSONA (you are commenting as this person):
- Name: ${persona.name}
${persona.bio ? `- Bio: ${persona.bio}` : ''}
${persona.tone ? `- Tone: ${persona.tone}` : ''}

YOUR INTENT: ${intentDescription}

SUBREDDIT RULES:
${context.subreddit.rulesText ?? 'Standard Reddit etiquette applies.'}

REQUIREMENTS:
1. Write a natural, authentic comment that adds value
2. Stay in character as the persona
3. ${slot.intent === 'question' ? 'Ask something genuinely curious readers might wonder' : ''}
4. ${slot.intent === 'counterpoint' ? 'Be respectful - disagree with the idea, not the person' : ''}
5. ${slot.intent === 'add_example' ? 'Make sure your example is relevant and illustrative' : ''}
6. Do NOT sound promotional or like marketing
7. Do NOT repeat the same points as prior comments
8. Keep it concise but substantive (2-4 sentences typically)

RESPOND WITH VALID JSON:
{
  "comment": {
    "body_md": "string - your comment text",
    "risk_flags": ["any", "risks"]
  }
}`;
}

function buildOpReplyPrompt(
  context: ThreadGenerationContext,
  slot: ThreadSlot,
  opPost: { title: string; body_md: string },
  parentComment: { persona: string; body: string },
  opPersonaId: string
): string {
  const persona = context.personas.get(opPersonaId)!;
  const intentDescription = slot.intent
    ? getIntentDescription(slot.intent)
    : 'Respond helpfully';

  return `Generate a reply from the Original Poster (OP) to a comment on their post in r/${context.subreddit.name}.

YOUR ORIGINAL POST:
Title: ${opPost.title}

${opPost.body_md}

COMMENT YOU ARE REPLYING TO:
From ${parentComment.persona}:
${parentComment.body}

PERSONA (you are the OP, replying as this person):
- Name: ${persona.name}
${persona.bio ? `- Bio: ${persona.bio}` : ''}
${persona.tone ? `- Tone: ${persona.tone}` : ''}

YOUR INTENT: ${intentDescription}

REQUIREMENTS:
1. Stay in character as the OP
2. Respond directly to the commenter's point
3. Be helpful and engaging
4. Thank them if appropriate
5. Add value - don't just say "thanks!"
6. Keep it conversational (1-3 sentences typically)

RESPOND WITH VALID JSON:
{
  "reply": {
    "body_md": "string - your reply text",
    "risk_flags": ["any", "risks"]
  }
}`;
}

// ============================================
// Generation Function
// ============================================

export interface LLMGenerateFunction {
  (prompt: string): Promise<{ content: string; success: boolean; error?: string }>;
}

/**
 * Generate all content assets for a thread plan
 */
export async function generateThreadContent(
  slots: ThreadSlot[],
  context: ThreadGenerationContext,
  generateLLM: LLMGenerateFunction
): Promise<ThreadGenerationResult> {
  const assets: GeneratedAsset[] = [];
  const errors: string[] = [];

  // Track generated content for contextual prompts
  let opPost: { title: string; body_md: string } | null = null;
  const comments: Map<number, { persona: string; body: string }> = new Map();

  // Sort slots by offset to process in order
  const sortedSlots = [...slots].sort(
    (a, b) => a.offsetMinutes - b.offsetMinutes
  );

  for (const slot of sortedSlots) {
    try {
      if (slot.assetType === 'post') {
        // Generate OP post
        const prompt = buildPostPrompt(context, slot.personaId);
        const result = await generateLLM(prompt);

        if (!result.success) {
          errors.push(`Failed to generate post: ${result.error}`);
          continue;
        }

        const parsed = PostOutputSchema.safeParse(JSON.parse(result.content));
        if (!parsed.success) {
          errors.push(`Invalid post response: ${parsed.error.message}`);
          continue;
        }

        opPost = {
          title: parsed.data.post.title,
          body_md: parsed.data.post.body_md,
        };

        assets.push({
          slotIndex: slot.index,
          assetType: 'post',
          personaId: slot.personaId,
          title: parsed.data.post.title,
          bodyMd: parsed.data.post.body_md,
          metadata: {
            threadRole: 'op',
            offsetMinutesFromPost: 0,
            intent: null,
            parentSlotIndex: null,
            topicClusterKey: parsed.data.post.topic_cluster_key,
            targetQueryTags: parsed.data.post.target_query_tags,
            riskFlags: parsed.data.post.risk_flags,
            disclosureUsed: parsed.data.post.disclosure_used,
          },
        });
      } else if (slot.assetType === 'comment') {
        if (!opPost) {
          errors.push(`Cannot generate comment ${slot.index}: no OP post yet`);
          continue;
        }

        // Get prior comments for context
        const priorComments = Array.from(comments.entries())
          .filter(([idx]) => idx < slot.index)
          .map(([, c]) => c);

        const prompt = buildCommentPrompt(context, slot, opPost, priorComments);
        const result = await generateLLM(prompt);

        if (!result.success) {
          errors.push(`Failed to generate comment ${slot.index}: ${result.error}`);
          continue;
        }

        const parsed = CommentOutputSchema.safeParse(JSON.parse(result.content));
        if (!parsed.success) {
          errors.push(`Invalid comment response: ${parsed.error.message}`);
          continue;
        }

        const persona = context.personas.get(slot.personaId)!;
        comments.set(slot.index, {
          persona: persona.name,
          body: parsed.data.comment.body_md,
        });

        assets.push({
          slotIndex: slot.index,
          assetType: 'comment',
          personaId: slot.personaId,
          title: null,
          bodyMd: parsed.data.comment.body_md,
          metadata: {
            threadRole: 'commenter',
            offsetMinutesFromPost: slot.offsetMinutes,
            intent: slot.intent,
            parentSlotIndex: slot.parentSlotIndex,
            riskFlags: parsed.data.comment.risk_flags,
          },
        });
      } else if (slot.assetType === 'followup') {
        if (!opPost) {
          errors.push(`Cannot generate reply ${slot.index}: no OP post yet`);
          continue;
        }

        // Get the comment we're replying to
        const parentComment = comments.get(slot.parentSlotIndex!);
        if (!parentComment) {
          errors.push(`Cannot generate reply ${slot.index}: parent comment not found`);
          continue;
        }

        const opPersonaId = slots.find((s) => s.assetType === 'post')!.personaId;
        const prompt = buildOpReplyPrompt(
          context,
          slot,
          opPost,
          parentComment,
          opPersonaId
        );
        const result = await generateLLM(prompt);

        if (!result.success) {
          errors.push(`Failed to generate reply ${slot.index}: ${result.error}`);
          continue;
        }

        const parsed = ReplyOutputSchema.safeParse(JSON.parse(result.content));
        if (!parsed.success) {
          errors.push(`Invalid reply response: ${parsed.error.message}`);
          continue;
        }

        assets.push({
          slotIndex: slot.index,
          assetType: 'followup',
          personaId: slot.personaId,
          title: null,
          bodyMd: parsed.data.reply.body_md,
          metadata: {
            threadRole: 'op',
            offsetMinutesFromPost: slot.offsetMinutes,
            intent: slot.intent,
            parentSlotIndex: slot.parentSlotIndex,
            riskFlags: parsed.data.reply.risk_flags,
          },
        });
      }
    } catch (error) {
      errors.push(`Error processing slot ${slot.index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    success: errors.length === 0,
    assets,
    errors,
  };
}

/**
 * Convert generated assets to database insert format
 */
export function assetsToDbInserts(
  calendarItemId: string,
  assets: GeneratedAsset[],
  assetIdMap: Map<number, string> = new Map()
): Array<{
  calendar_item_id: string;
  asset_type: 'post' | 'comment' | 'followup';
  author_persona_id: string;
  title: string | null;
  body_md: string;
  metadata_json: Record<string, unknown>;
  version: number;
  status: 'active';
}> {
  return assets.map((asset) => ({
    calendar_item_id: calendarItemId,
    asset_type: asset.assetType,
    author_persona_id: asset.personaId,
    title: asset.title,
    body_md: asset.bodyMd,
    metadata_json: {
      thread_role: asset.metadata.threadRole,
      offset_minutes_from_post: asset.metadata.offsetMinutesFromPost,
      intent: asset.metadata.intent,
      parent_asset_id: asset.metadata.parentSlotIndex !== null
        ? assetIdMap.get(asset.metadata.parentSlotIndex) || null
        : null,
      slot_index: asset.slotIndex,
      topic_cluster_key: asset.metadata.topicClusterKey,
      target_query_tags: asset.metadata.targetQueryTags,
      risk_flags: asset.metadata.riskFlags,
      disclosure_used: asset.metadata.disclosureUsed,
    },
    version: 1,
    status: 'active' as const,
  }));
}

