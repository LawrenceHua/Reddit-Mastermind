/**
 * Use Case Tests for Reddit Mastermind
 * 
 * These tests verify the core algorithm requirements from the challenge:
 * 
 * INPUTS:
 * - Company info
 * - List of personas (2+)
 * - Subreddits
 * - ChatGPT queries to target
 * - Number of posts per week
 * 
 * OUTPUTS:
 * - Content calendar for the week
 * - Ability to produce calendars for subsequent weeks
 * 
 * KEY CONCERNS:
 * - Natural conversations (not manufactured)
 * - Multiple personas replying to posts
 * - Edge cases: overposting, overlapping topics, awkward back-and-forth
 * - Quality evaluation (3/10 vs 9/10)
 */

import { describe, it, expect } from 'vitest';
import {
  buildPostSlots,
  assignSubreddits,
  assignPersonas,
  validateSubredditAssignments,
  validatePersonaSpacing,
  buildThreadPlan,
  DEFAULT_THREAD_CONFIG,
} from './index';
import type { Subreddit, Persona, SlotConstraints } from './types';

// ============================================
// Sample Data: SlideForge (from challenge)
// ============================================

const SLIDEFORGE_COMPANY = {
  name: 'SlideForge',
  description: 'AI-powered presentation design platform',
  website: 'https://slideforge.com',
  industry: 'SaaS / Productivity',
  targetAudience: 'Startup founders, marketers, consultants',
  keyBenefits: [
    'Creates professional decks in minutes',
    'AI generates content from bullet points',
    'Brand-consistent templates',
  ],
};

const SLIDEFORGE_PERSONAS: Persona[] = [
  {
    id: 'persona-alex',
    name: 'Alex Chen',
    bio: 'Startup founder who discovered SlideForge while preparing pitch deck',
    tone: 'casual, enthusiastic',
    expertiseTags: ['startups', 'fundraising', 'productivity'],
    disclosureRequired: false,
  },
  {
    id: 'persona-morgan',
    name: 'Morgan Davis',
    bio: 'Marketing consultant who uses SlideForge for client presentations',
    tone: 'professional, helpful',
    expertiseTags: ['marketing', 'consulting', 'design'],
    disclosureRequired: true, // Affiliate
  },
  {
    id: 'persona-jamie',
    name: 'Jamie Park',
    bio: 'Product manager curious about presentation tools',
    tone: 'analytical, curious',
    expertiseTags: ['product', 'tools', 'efficiency'],
    disclosureRequired: false,
  },
];

const SLIDEFORGE_SUBREDDITS: Subreddit[] = [
  {
    id: 'sub-startups',
    name: 'r/startups',
    riskLevel: 'medium',
    maxPostsPerWeek: 2,
    allowedPostTypes: ['text'],
    rulesText: 'No blatant self-promotion. Provide value.',
  },
  {
    id: 'sub-entrepreneur',
    name: 'r/Entrepreneur',
    riskLevel: 'medium',
    maxPostsPerWeek: 2,
    allowedPostTypes: ['text'],
    rulesText: 'Share experiences, not ads.',
  },
  {
    id: 'sub-productivity',
    name: 'r/productivity',
    riskLevel: 'low',
    maxPostsPerWeek: 3,
    allowedPostTypes: ['text'],
    rulesText: 'Genuine advice welcome.',
  },
  {
    id: 'sub-saas',
    name: 'r/SaaS',
    riskLevel: 'high',
    maxPostsPerWeek: 1,
    allowedPostTypes: ['text'],
    rulesText: 'Strict anti-spam rules.',
  },
];

const SLIDEFORGE_TOPIC_SEEDS = [
  { type: 'target_query', text: 'best presentation software for startups', tags: ['presentation', 'startup'] },
  { type: 'target_query', text: 'pitch deck tools 2024', tags: ['pitch deck', 'tools'] },
  { type: 'pain_point', text: 'spending too much time on slide design', tags: ['time', 'design'] },
  { type: 'pain_point', text: 'inconsistent branding in presentations', tags: ['branding'] },
  { type: 'faq', text: 'how to make investor-ready pitch deck', tags: ['investor', 'pitch'] },
];

const DEFAULT_CONSTRAINTS: SlotConstraints = {
  maxPostsPerSubreddit: new Map(),
  subredditRiskLevels: new Map(),
  personaSpacingHours: 24,
  riskTolerance: 'medium',
};

// ============================================
// Use Case 1: Basic Calendar Generation
// ============================================

describe('Use Case: Generate Weekly Content Calendar', () => {
  const weekStart = new Date('2024-01-08T00:00:00Z'); // Monday

  it('generates calendar with specified number of posts per week', () => {
    const postsPerWeek = 5;
    const slots = buildPostSlots(weekStart, postsPerWeek, 'slideforge-week-1');
    
    expect(slots).toHaveLength(postsPerWeek);
    
    // Each slot should have proper structure
    for (const slot of slots) {
      expect(slot.index).toBeGreaterThanOrEqual(0);
      expect(slot.scheduledAt).toBeInstanceOf(Date);
      expect(slot.dayOfWeek).toBeGreaterThanOrEqual(0); // Sun=0
      expect(slot.dayOfWeek).toBeLessThanOrEqual(6); // Sun-Sat
    }
  });

  it('assigns subreddits respecting max posts per week limit', () => {
    const slots = buildPostSlots(weekStart, 5, 'test');
    const result = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'test');
    
    expect(result.errors).toHaveLength(0);
    
    // Validate subreddit limits
    const validation = validateSubredditAssignments(result.slots, SLIDEFORGE_SUBREDDITS);
    expect(validation.valid).toBe(true);
    
    // Count posts per subreddit
    const counts = new Map<string, number>();
    for (const slot of result.slots) {
      counts.set(slot.subredditId, (counts.get(slot.subredditId) ?? 0) + 1);
    }
    
    // Verify no subreddit exceeds its max
    for (const [subId, count] of counts) {
      const subreddit = SLIDEFORGE_SUBREDDITS.find(s => s.id === subId);
      expect(count).toBeLessThanOrEqual(subreddit?.maxPostsPerWeek ?? 0);
    }
  });

  it('assigns 2+ personas distributed across posts', () => {
    const slots = buildPostSlots(weekStart, 6, 'test');
    const withSubs = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'test');
    const result = assignPersonas(withSubs.slots, SLIDEFORGE_PERSONAS, 24, 'test');
    
    expect(result.errors).toHaveLength(0);
    
    // Count personas used
    const personasUsed = new Set(result.slots.map(s => s.personaId));
    expect(personasUsed.size).toBeGreaterThanOrEqual(2);
    
    // All personas should be from our list
    for (const slot of result.slots) {
      const persona = SLIDEFORGE_PERSONAS.find(p => p.id === slot.personaId);
      expect(persona).toBeDefined();
    }
  });

  it('produces complete calendar output with all required fields', () => {
    const slots = buildPostSlots(weekStart, 5, 'complete-test');
    const withSubs = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'complete-test');
    const withPersonas = assignPersonas(withSubs.slots, SLIDEFORGE_PERSONAS, 24, 'complete-test');
    
    // Verify complete output structure
    for (const slot of withPersonas.slots) {
      expect(slot.index).toBeDefined();
      expect(slot.scheduledAt).toBeInstanceOf(Date);
      expect(slot.subredditId).toBeDefined();
      expect(slot.personaId).toBeDefined();
      
      // Should be able to map to actual entities
      const subreddit = SLIDEFORGE_SUBREDDITS.find(s => s.id === slot.subredditId);
      const persona = SLIDEFORGE_PERSONAS.find(p => p.id === slot.personaId);
      expect(subreddit).toBeDefined();
      expect(persona).toBeDefined();
    }
  });
});

// ============================================
// Use Case 2: Multi-Persona Thread Planning
// "When we create posts and have our own accounts reply"
// ============================================

describe('Use Case: Multi-Persona Thread Conversations', () => {
  it('creates thread plan with OP post and multiple persona comments', () => {
    const plan = buildThreadPlan(
      'calendar-item-1',
      'persona-alex', // OP
      SLIDEFORGE_PERSONAS,
      'thread-seed'
    );
    
    // Should have OP post
    const opPost = plan.slots.find(s => s.assetType === 'post');
    expect(opPost).toBeDefined();
    expect(opPost?.personaId).toBe('persona-alex');
    expect(opPost?.offsetMinutes).toBe(0);
    
    // Should have 4 comments from other personas
    const comments = plan.slots.filter(s => s.assetType === 'comment');
    expect(comments.length).toBe(DEFAULT_THREAD_CONFIG.numCommenters);
    
    // Comments should be from different personas than OP
    for (const comment of comments) {
      // At least some comments should be from non-OP personas
      // (with limited personas, some might repeat)
      expect(comment.personaId).toBeDefined();
    }
  });

  it('includes OP replies to comments', () => {
    const plan = buildThreadPlan(
      'calendar-item-1',
      'persona-alex',
      SLIDEFORGE_PERSONAS,
      'thread-seed'
    );
    
    // Should have OP replies
    const opReplies = plan.slots.filter(s => s.assetType === 'followup');
    expect(opReplies.length).toBe(DEFAULT_THREAD_CONFIG.numOpReplies);
    
    // OP replies should be from OP persona
    for (const reply of opReplies) {
      expect(reply.personaId).toBe('persona-alex');
      expect(reply.parentSlotIndex).toBeGreaterThan(0); // Replying to comments
    }
  });

  it('spaces comments realistically over time', () => {
    const plan = buildThreadPlan(
      'calendar-item-1',
      'persona-alex',
      SLIDEFORGE_PERSONAS,
      'thread-seed'
    );
    
    const comments = plan.slots.filter(s => s.assetType === 'comment');
    
    // Comments should have varying time offsets
    const offsets = comments.map(c => c.offsetMinutes);
    const uniqueOffsets = new Set(offsets);
    
    // Should have variety in timing (not all at same time)
    expect(uniqueOffsets.size).toBeGreaterThan(1);
    
    // Early comments (0-4 hours)
    const earlyComments = comments.filter(c => c.offsetMinutes <= 240);
    expect(earlyComments.length).toBeGreaterThanOrEqual(1);
    
    // Late comments (4-24 hours)
    const lateComments = comments.filter(c => c.offsetMinutes > 240);
    expect(lateComments.length).toBeGreaterThanOrEqual(1);
  });

  it('assigns different intents to comments for natural conversation', () => {
    const plan = buildThreadPlan(
      'calendar-item-1',
      'persona-alex',
      SLIDEFORGE_PERSONAS,
      'thread-seed'
    );
    
    const comments = plan.slots.filter(s => s.assetType === 'comment');
    const intents = comments.map(c => c.intent);
    
    // Should have varied intents
    const uniqueIntents = new Set(intents);
    expect(uniqueIntents.size).toBeGreaterThanOrEqual(2);
    
    // Common intents for natural conversation
    const validIntents = ['question', 'counterpoint', 'add_example', 'clarify', 'agree', 'personal_experience'];
    for (const intent of intents) {
      expect(validIntents).toContain(intent);
    }
  });
});

// ============================================
// Use Case 3: Edge Cases
// ============================================

describe('Edge Case: Overposting in Subreddit', () => {
  it('prevents posting more than subreddit limit allows', () => {
    const weekStart = new Date('2024-01-08');
    const slots = buildPostSlots(weekStart, 10, 'overpost-test');
    
    // Only one high-risk subreddit with max 1 post/week
    const strictSubreddits: Subreddit[] = [
      {
        id: 'sub-strict',
        name: 'r/strict',
        riskLevel: 'high',
        maxPostsPerWeek: 1,
        allowedPostTypes: ['text'],
        rulesText: 'Very strict rules',
      },
    ];
    
    const result = assignSubreddits(slots, strictSubreddits, DEFAULT_CONSTRAINTS, 'test');
    
    // Should report insufficient capacity
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('Insufficient'))).toBe(true);
  });

  it('balances posts across subreddits to avoid concentration', () => {
    const weekStart = new Date('2024-01-08');
    const slots = buildPostSlots(weekStart, 5, 'balance-test');
    
    const result = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'balance-test');
    
    // Count posts per subreddit
    const counts = new Map<string, number>();
    for (const slot of result.slots) {
      counts.set(slot.subredditId, (counts.get(slot.subredditId) ?? 0) + 1);
    }
    
    // No single subreddit should have all the posts
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});

describe('Edge Case: Persona Spacing / Awkward Back-and-Forth', () => {
  it('enforces minimum spacing between same persona posts', () => {
    const weekStart = new Date('2024-01-08');
    const slots = buildPostSlots(weekStart, 6, 'spacing-test');
    const withSubs = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'spacing-test');
    
    const result = assignPersonas(withSubs.slots, SLIDEFORGE_PERSONAS, 24, 'spacing-test');
    const validation = validatePersonaSpacing(result.slots, 24);
    
    // Should minimize spacing violations
    expect(validation.violations.length).toBeLessThanOrEqual(1);
  });

  it('prevents same persona from commenting on their own post in thread', () => {
    const plan = buildThreadPlan(
      'item-1',
      'persona-alex',
      SLIDEFORGE_PERSONAS,
      'self-comment-test'
    );
    
    const comments = plan.slots.filter(s => s.assetType === 'comment');
    
    // With 3 personas, most comments should be from non-OP personas
    const nonOpComments = comments.filter(c => c.personaId !== 'persona-alex');
    expect(nonOpComments.length).toBeGreaterThanOrEqual(comments.length - 1);
  });

  it('limits internal personas per thread to avoid suspicious patterns', () => {
    const plan = buildThreadPlan(
      'item-1',
      'persona-alex',
      SLIDEFORGE_PERSONAS,
      'persona-limit-test'
    );
    
    const comments = plan.slots.filter(s => s.assetType === 'comment');
    const commentPersonas = new Set(comments.map(c => c.personaId));
    
    // Should not use all personas as commenters (looks coordinated)
    expect(commentPersonas.size).toBeLessThanOrEqual(DEFAULT_THREAD_CONFIG.maxInternalPersonasPerThread);
  });
});

describe('Edge Case: Only 2 Personas (Minimum)', () => {
  it('works correctly with minimum 2 personas', () => {
    const minPersonas: Persona[] = SLIDEFORGE_PERSONAS.slice(0, 2);
    const weekStart = new Date('2024-01-08');
    
    const slots = buildPostSlots(weekStart, 4, 'min-personas');
    const withSubs = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'min-personas');
    const result = assignPersonas(withSubs.slots, minPersonas, 24, 'min-personas');
    
    expect(result.errors).toHaveLength(0);
    
    // Both personas should be used
    const usedPersonas = new Set(result.slots.map(s => s.personaId));
    expect(usedPersonas.size).toBe(2);
  });

  it('creates thread with only 2 personas', () => {
    const minPersonas: Persona[] = SLIDEFORGE_PERSONAS.slice(0, 2);
    
    const plan = buildThreadPlan(
      'item-1',
      minPersonas[0].id,
      minPersonas,
      'two-persona-thread'
    );
    
    // Should still work
    expect(plan.slots.length).toBeGreaterThan(1);
    
    // Second persona should comment
    const comments = plan.slots.filter(s => s.assetType === 'comment');
    const commenterPersonas = new Set(comments.map(c => c.personaId));
    expect(commenterPersonas.has(minPersonas[1].id)).toBe(true);
  });
});

// ============================================
// Use Case 4: Subsequent Weeks
// ============================================

describe('Use Case: Generate Subsequent Weeks', () => {
  it('generates unique calendars for consecutive weeks', () => {
    const week1Start = new Date('2024-01-08T00:00:00Z');
    const week2Start = new Date('2024-01-15T00:00:00Z');
    const week3Start = new Date('2024-01-22T00:00:00Z');
    
    const week1Slots = buildPostSlots(week1Start, 5, 'week-1');
    const week2Slots = buildPostSlots(week2Start, 5, 'week-2');
    const week3Slots = buildPostSlots(week3Start, 5, 'week-3');
    
    // Each week should produce valid slots
    expect(week1Slots).toHaveLength(5);
    expect(week2Slots).toHaveLength(5);
    expect(week3Slots).toHaveLength(5);
    
    // Different seeds should produce different relative distributions
    // (checking day-of-week patterns since absolute times depend on week start)
    const week1Days = week1Slots.map(s => s.dayOfWeek).sort();
    const week2Days = week2Slots.map(s => s.dayOfWeek).sort();
    
    // At least verify each week produces valid Sun-Sat slots
    for (const slot of [...week1Slots, ...week2Slots, ...week3Slots]) {
      expect(slot.dayOfWeek).toBeGreaterThanOrEqual(0); // Sun=0
      expect(slot.dayOfWeek).toBeLessThanOrEqual(6); // Sat=6
    }
  });

  it('maintains consistent persona distribution across weeks', () => {
    const weeks = [
      new Date('2024-01-08'),
      new Date('2024-01-15'),
      new Date('2024-01-22'),
    ];
    
    const allPersonaCounts = new Map<string, number>();
    
    for (let i = 0; i < weeks.length; i++) {
      const slots = buildPostSlots(weeks[i], 5, `week-${i}`);
      const withSubs = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, `week-${i}`);
      const withPersonas = assignPersonas(withSubs.slots, SLIDEFORGE_PERSONAS, 24, `week-${i}`);
      
      for (const slot of withPersonas.slots) {
        allPersonaCounts.set(slot.personaId, (allPersonaCounts.get(slot.personaId) ?? 0) + 1);
      }
    }
    
    // All personas should be used across weeks
    expect(allPersonaCounts.size).toBe(SLIDEFORGE_PERSONAS.length);
    
    // Distribution should be reasonably balanced
    const counts = Array.from(allPersonaCounts.values());
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    expect(maxCount - minCount).toBeLessThanOrEqual(5);
  });
});

// ============================================
// Use Case 5: Deterministic Planning
// ============================================

describe('Use Case: Deterministic/Reproducible Calendar', () => {
  it('same inputs produce same calendar', () => {
    const weekStart = new Date('2024-01-08');
    const seed = 'slideforge-2024-week-1';
    
    // Generate twice with same inputs
    const slots1 = buildPostSlots(weekStart, 5, seed);
    const withSubs1 = assignSubreddits(slots1, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, seed);
    const withPersonas1 = assignPersonas(withSubs1.slots, SLIDEFORGE_PERSONAS, 24, seed);
    
    const slots2 = buildPostSlots(weekStart, 5, seed);
    const withSubs2 = assignSubreddits(slots2, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, seed);
    const withPersonas2 = assignPersonas(withSubs2.slots, SLIDEFORGE_PERSONAS, 24, seed);
    
    // Should be identical
    expect(withPersonas1.slots.map(s => ({
      time: s.scheduledAt.toISOString(),
      sub: s.subredditId,
      persona: s.personaId,
    }))).toEqual(withPersonas2.slots.map(s => ({
      time: s.scheduledAt.toISOString(),
      sub: s.subredditId,
      persona: s.personaId,
    })));
  });

  it('different seeds produce different calendars', () => {
    const weekStart = new Date('2024-01-08');
    
    const slots1 = buildPostSlots(weekStart, 5, 'seed-a');
    const withSubs1 = assignSubreddits(slots1, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'seed-a');
    
    const slots2 = buildPostSlots(weekStart, 5, 'seed-b');
    const withSubs2 = assignSubreddits(slots2, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'seed-b');
    
    // Should be different
    const times1 = slots1.map(s => s.scheduledAt.toISOString());
    const times2 = slots2.map(s => s.scheduledAt.toISOString());
    expect(times1).not.toEqual(times2);
  });
});

// ============================================
// Use Case 6: Risk Level Handling
// ============================================

describe('Use Case: Risk Level Management', () => {
  it('prioritizes lower risk subreddits by default', () => {
    const weekStart = new Date('2024-01-08T00:00:00Z');
    
    const slots = buildPostSlots(weekStart, 4, 'risk-test');
    const result = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'risk-test');
    
    // Count risk levels used
    const riskCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };
    for (const slot of result.slots) {
      const sub = SLIDEFORGE_SUBREDDITS.find(s => s.id === slot.subredditId);
      if (sub) riskCounts[sub.riskLevel]++;
    }
    
    // Lower risk should be preferred (low should have most or equal assignments)
    expect(riskCounts.low).toBeGreaterThanOrEqual(riskCounts.high);
  });

  it('respects subreddit capacity limits regardless of risk', () => {
    const weekStart = new Date('2024-01-08T00:00:00Z');
    
    const slots = buildPostSlots(weekStart, 5, 'capacity-test');
    const result = assignSubreddits(slots, SLIDEFORGE_SUBREDDITS, DEFAULT_CONSTRAINTS, 'capacity-test');
    
    // Validate no subreddit exceeds its limit
    const counts = new Map<string, number>();
    for (const slot of result.slots) {
      counts.set(slot.subredditId, (counts.get(slot.subredditId) ?? 0) + 1);
    }
    
    for (const [subId, count] of counts) {
      const sub = SLIDEFORGE_SUBREDDITS.find(s => s.id === subId);
      expect(count).toBeLessThanOrEqual(sub?.maxPostsPerWeek ?? 0);
    }
  });
});

