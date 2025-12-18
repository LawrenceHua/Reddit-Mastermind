/**
 * Thread Planning Module
 *
 * Plans multi-persona conversation threads for each calendar item:
 * - OP post at scheduled_at
 * - 4 comments from other personas (not OP)
 * - OP replies to some comments
 *
 * Thread structure is stored in content_assets.metadata_json with:
 * - parent_asset_id: string | null (for nesting)
 * - offset_minutes_from_post: number
 * - intent: string (question, counterpoint, add_example, clarify, agree)
 * - thread_role: 'op' | 'commenter'
 */

import { SeededRandom } from './random';

// ============================================
// Types
// ============================================

export interface ThreadSlot {
  /** Slot index within the thread (0 = OP post, 1-4 = comments, 5+ = OP replies) */
  index: number;
  /** Type of content */
  assetType: 'post' | 'comment' | 'followup';
  /** Persona ID for this slot */
  personaId: string;
  /** Minutes after the OP post */
  offsetMinutes: number;
  /** Parent slot index (null for OP post, comment index for replies) */
  parentSlotIndex: number | null;
  /** Intent for the comment (what it's trying to do) */
  intent: ThreadIntent | null;
  /** Role in the thread */
  threadRole: 'op' | 'commenter';
}

export type ThreadIntent =
  | 'question' // Ask a genuine question about the post
  | 'counterpoint' // Offer alternative perspective
  | 'add_example' // Add a relevant example/anecdote
  | 'clarify' // Ask for clarification
  | 'agree' // Express agreement and expand
  | 'personal_experience' // Share related personal experience
  | 'thanks'; // Express appreciation for the advice

export interface ThreadPlan {
  /** The calendar item ID this plan is for */
  calendarItemId: string;
  /** OP persona ID */
  opPersonaId: string;
  /** All thread slots including OP post, comments, and replies */
  slots: ThreadSlot[];
}

export interface ThreadPlannerConfig {
  /** Number of commenter slots (default 4) */
  numCommenters: number;
  /** Number of OP reply slots (default 2) */
  numOpReplies: number;
  /** Minimum minutes between comments (default 15) */
  minCommentSpacingMinutes: number;
  /** Maximum hours for early comments (default 4) */
  earlyCommentWindowHours: number;
  /** Maximum hours for late comments (default 24) */
  lateCommentWindowHours: number;
  /** Maximum internal personas per thread (default 2) */
  maxInternalPersonasPerThread: number;
}

export const DEFAULT_THREAD_CONFIG: ThreadPlannerConfig = {
  numCommenters: 4,
  numOpReplies: 2,
  minCommentSpacingMinutes: 15,
  earlyCommentWindowHours: 4,
  lateCommentWindowHours: 24,
  maxInternalPersonasPerThread: 2,
};

// ============================================
// Intent Selection
// ============================================

const COMMENT_INTENTS: ThreadIntent[] = [
  'question',
  'counterpoint',
  'add_example',
  'clarify',
  'agree',
  'personal_experience',
];

const REPLY_INTENTS: ThreadIntent[] = ['clarify', 'thanks', 'add_example'];

function selectCommentIntents(
  count: number,
  rng: SeededRandom
): ThreadIntent[] {
  const intents: ThreadIntent[] = [];
  const available = [...COMMENT_INTENTS];

  // Ensure variety - don't repeat intents if possible
  for (let i = 0; i < count; i++) {
    if (available.length === 0) {
      // Reset if we've used all intents
      available.push(...COMMENT_INTENTS);
    }

    const index = Math.floor(rng.next() * available.length);
    intents.push(available[index]);
    available.splice(index, 1);
  }

  return intents;
}

// ============================================
// Timing Calculation
// ============================================

interface CommentTiming {
  offsetMinutes: number;
  isEarly: boolean; // First 4 hours
}

function generateCommentTimings(
  count: number,
  config: ThreadPlannerConfig,
  rng: SeededRandom
): CommentTiming[] {
  const timings: CommentTiming[] = [];

  // Distribute comments: 2 early (0-4h), 2 late (4-24h)
  const earlyCount = Math.min(2, count);
  const lateCount = count - earlyCount;

  // Generate early comment times (15 min - 4 hours)
  for (let i = 0; i < earlyCount; i++) {
    const minMinutes = config.minCommentSpacingMinutes + i * config.minCommentSpacingMinutes;
    const maxMinutes = config.earlyCommentWindowHours * 60;
    const offset = minMinutes + Math.floor(rng.next() * (maxMinutes - minMinutes));
    timings.push({ offsetMinutes: offset, isEarly: true });
  }

  // Generate late comment times (4-24 hours)
  for (let i = 0; i < lateCount; i++) {
    const minMinutes = config.earlyCommentWindowHours * 60;
    const maxMinutes = config.lateCommentWindowHours * 60;
    const offset = minMinutes + Math.floor(rng.next() * (maxMinutes - minMinutes));
    timings.push({ offsetMinutes: offset, isEarly: false });
  }

  // Sort by time
  return timings.sort((a, b) => a.offsetMinutes - b.offsetMinutes);
}

function generateReplyTimings(
  commentTimings: CommentTiming[],
  count: number,
  config: ThreadPlannerConfig,
  rng: SeededRandom
): { offsetMinutes: number; replyToIndex: number }[] {
  const replyTimings: { offsetMinutes: number; replyToIndex: number }[] = [];

  // OP replies to some early comments
  const earlyComments = commentTimings
    .map((t, i) => ({ ...t, index: i }))
    .filter((t) => t.isEarly);

  if (earlyComments.length === 0) return replyTimings;

  const replyCount = Math.min(count, earlyComments.length);
  const shuffled = rng.shuffle(earlyComments);

  for (let i = 0; i < replyCount; i++) {
    const comment = shuffled[i];
    // Reply 30-120 minutes after the comment
    const replyDelay = 30 + Math.floor(rng.next() * 90);
    replyTimings.push({
      offsetMinutes: comment.offsetMinutes + replyDelay,
      replyToIndex: comment.index + 1, // +1 because OP post is slot 0
    });
  }

  return replyTimings.sort((a, b) => a.offsetMinutes - b.offsetMinutes);
}

// ============================================
// Persona Assignment
// ============================================

interface PersonaForThread {
  id: string;
}

function assignCommentPersonas(
  personas: PersonaForThread[],
  opPersonaId: string,
  count: number,
  config: ThreadPlannerConfig,
  rng: SeededRandom
): string[] {
  // Filter out OP persona - commenters should be different people
  const availablePersonas = personas.filter((p) => p.id !== opPersonaId);

  if (availablePersonas.length === 0) {
    // Fallback: if only one persona, it has to comment on its own post
    // (not ideal but prevents errors)
    return Array(count).fill(opPersonaId);
  }

  // Limit internal personas per thread
  const maxPersonas = Math.min(
    config.maxInternalPersonasPerThread,
    availablePersonas.length
  );

  const selectedPersonas = rng.shuffle(availablePersonas).slice(0, maxPersonas);
  const assignments: string[] = [];

  for (let i = 0; i < count; i++) {
    // Round-robin through selected personas
    assignments.push(selectedPersonas[i % selectedPersonas.length].id);
  }

  return assignments;
}

// ============================================
// Main Planning Function
// ============================================

/**
 * Build a complete thread plan for a calendar item.
 *
 * @param calendarItemId - The calendar item this thread belongs to
 * @param opPersonaId - The persona who makes the OP post
 * @param personas - All available personas for the project
 * @param seed - Seed for deterministic planning
 * @param config - Thread configuration options
 */
export function buildThreadPlan(
  calendarItemId: string,
  opPersonaId: string,
  personas: PersonaForThread[],
  seed: string,
  config: ThreadPlannerConfig = DEFAULT_THREAD_CONFIG
): ThreadPlan {
  const rng = new SeededRandom(`${seed}-thread-${calendarItemId}`);
  const slots: ThreadSlot[] = [];

  // Slot 0: OP Post
  slots.push({
    index: 0,
    assetType: 'post',
    personaId: opPersonaId,
    offsetMinutes: 0,
    parentSlotIndex: null,
    intent: null,
    threadRole: 'op',
  });

  // Generate comment timings
  const commentTimings = generateCommentTimings(
    config.numCommenters,
    config,
    rng
  );

  // Generate intents for comments
  const commentIntents = selectCommentIntents(config.numCommenters, rng);

  // Assign personas to comments
  const commentPersonas = assignCommentPersonas(
    personas,
    opPersonaId,
    config.numCommenters,
    config,
    rng
  );

  // Add comment slots
  for (let i = 0; i < config.numCommenters; i++) {
    slots.push({
      index: i + 1,
      assetType: 'comment',
      personaId: commentPersonas[i],
      offsetMinutes: commentTimings[i].offsetMinutes,
      parentSlotIndex: 0, // All top-level comments reply to OP post
      intent: commentIntents[i],
      threadRole: 'commenter',
    });
  }

  // Generate OP reply timings
  const replyTimings = generateReplyTimings(
    commentTimings,
    config.numOpReplies,
    config,
    rng
  );

  // Add OP reply slots
  const replyIntents = rng.shuffle([...REPLY_INTENTS]);
  for (let i = 0; i < replyTimings.length; i++) {
    slots.push({
      index: config.numCommenters + 1 + i,
      assetType: 'followup',
      personaId: opPersonaId,
      offsetMinutes: replyTimings[i].offsetMinutes,
      parentSlotIndex: replyTimings[i].replyToIndex,
      intent: replyIntents[i % replyIntents.length],
      threadRole: 'op',
    });
  }

  return {
    calendarItemId,
    opPersonaId,
    slots,
  };
}

/**
 * Convert a thread slot to metadata for storage in content_assets.metadata_json
 */
export function threadSlotToMetadata(
  slot: ThreadSlot,
  parentAssetId: string | null = null
): Record<string, unknown> {
  return {
    thread_role: slot.threadRole,
    offset_minutes_from_post: slot.offsetMinutes,
    intent: slot.intent,
    parent_asset_id: parentAssetId,
    slot_index: slot.index,
  };
}

/**
 * Get summary of a thread plan for logging/debugging
 */
export function summarizeThreadPlan(plan: ThreadPlan): string {
  const comments = plan.slots.filter((s) => s.assetType === 'comment');
  const replies = plan.slots.filter((s) => s.assetType === 'followup');

  const personaSet = new Set(plan.slots.map((s) => s.personaId));

  return [
    `Thread Plan for ${plan.calendarItemId}:`,
    `  OP: ${plan.opPersonaId}`,
    `  Comments: ${comments.length} (personas: ${comments.map((c) => c.personaId.slice(0, 8)).join(', ')})`,
    `  OP Replies: ${replies.length}`,
    `  Total personas: ${personaSet.size}`,
    `  Timeline: ${plan.slots.map((s) => `${s.assetType}@${s.offsetMinutes}m`).join(' → ')}`,
  ].join('\n');
}

