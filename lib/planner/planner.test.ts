import { describe, it, expect } from 'vitest';
import { differenceInHours } from 'date-fns';
import {
  buildPostSlots,
  assignSubreddits,
  assignPersonas,
  validateSubredditAssignments,
  validatePersonaSpacing,
  createSeededRandom,
  stringToSeed,
} from './index';
import type { Subreddit, Persona, SlotConstraints } from './types';

describe('Seeded Random', () => {
  it('produces deterministic results with same seed', () => {
    const rng1 = createSeededRandom(12345);
    const rng2 = createSeededRandom(12345);

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).toEqual(results2);
  });

  it('produces different results with different seeds', () => {
    const rng1 = createSeededRandom(12345);
    const rng2 = createSeededRandom(54321);

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).not.toEqual(results2);
  });

  it('shuffle is deterministic', () => {
    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(42);

    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];

    expect(rng1.shuffle(arr1)).toEqual(rng2.shuffle(arr2));
  });

  it('stringToSeed produces consistent seeds', () => {
    expect(stringToSeed('test')).toBe(stringToSeed('test'));
    expect(stringToSeed('test')).not.toBe(stringToSeed('different'));
  });
});

describe('buildPostSlots', () => {
  const weekStart = new Date('2024-01-08T00:00:00Z'); // A Monday

  it('creates correct number of slots', () => {
    const slots = buildPostSlots(weekStart, 5);
    expect(slots).toHaveLength(5);
  });

  it('creates zero slots for zero posts', () => {
    const slots = buildPostSlots(weekStart, 0);
    expect(slots).toHaveLength(0);
  });

  it('spreads posts across different days', () => {
    const slots = buildPostSlots(weekStart, 5, 12345);
    const days = new Set(slots.map((s) => s.dayOfWeek));

    // With 5 posts over 5 weekdays, should have posts on multiple days
    expect(days.size).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic with same seed', () => {
    const slots1 = buildPostSlots(weekStart, 5, 12345);
    const slots2 = buildPostSlots(weekStart, 5, 12345);

    expect(slots1.map((s) => s.scheduledAt.toISOString())).toEqual(
      slots2.map((s) => s.scheduledAt.toISOString())
    );
  });

  it('produces different results with different seeds', () => {
    const slots1 = buildPostSlots(weekStart, 5, 12345);
    const slots2 = buildPostSlots(weekStart, 5, 54321);

    const times1 = slots1.map((s) => s.scheduledAt.toISOString());
    const times2 = slots2.map((s) => s.scheduledAt.toISOString());

    expect(times1).not.toEqual(times2);
  });

  it('slots are in chronological order', () => {
    const slots = buildPostSlots(weekStart, 10, 12345);

    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].scheduledAt.getTime()).toBeGreaterThanOrEqual(
        slots[i - 1].scheduledAt.getTime()
      );
    }
  });

  it('slots have sequential indices', () => {
    const slots = buildPostSlots(weekStart, 5, 12345);

    for (let i = 0; i < slots.length; i++) {
      expect(slots[i].index).toBe(i);
    }
  });

  it('schedules posts during reasonable hours', () => {
    const slots = buildPostSlots(weekStart, 20, 12345);

    for (const slot of slots) {
      const hour = slot.scheduledAt.getHours();
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThanOrEqual(19);
    }
  });
});

describe('assignSubreddits', () => {
  const createSubreddits = (count: number): Subreddit[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `sub-${i}`,
      name: `r/test${i}`,
      riskLevel: 'medium' as const,
      maxPostsPerWeek: 2,
      allowedPostTypes: ['text'],
      rulesText: null,
    }));

  const createSlots = (count: number) => buildPostSlots(new Date('2024-01-08'), count, 12345);

  const defaultConstraints: SlotConstraints = {
    maxPostsPerSubreddit: new Map(),
    subredditRiskLevels: new Map(),
    personaSpacingHours: 24,
    riskTolerance: 'medium',
  };

  it('assigns subreddits to all slots when capacity is sufficient', () => {
    const slots = createSlots(4);
    // With medium risk tolerance, effective capacity per sub is ~1.4 (2 * 0.7)
    // So 4 subs gives ~5.6 effective capacity for 4 slots
    const subreddits = createSubreddits(4);

    const result = assignSubreddits(slots, subreddits, defaultConstraints, 12345);

    expect(result.slots).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error when capacity is insufficient', () => {
    const slots = createSlots(10);
    const subreddits = createSubreddits(2); // 2 subs * 2 posts/week = 4 capacity

    const result = assignSubreddits(slots, subreddits, defaultConstraints, 12345);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Insufficient');
  });

  it('respects max posts per subreddit', () => {
    const slots = createSlots(4);
    const subreddits: Subreddit[] = [
      {
        id: 'sub-a',
        name: 'r/testa',
        riskLevel: 'low',
        maxPostsPerWeek: 2,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
      {
        id: 'sub-b',
        name: 'r/testb',
        riskLevel: 'low',
        maxPostsPerWeek: 2,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
    ];

    const result = assignSubreddits(slots, subreddits, defaultConstraints, 12345);
    const validation = validateSubredditAssignments(result.slots, subreddits);

    expect(validation.valid).toBe(true);
  });

  it('is deterministic with same seed', () => {
    const slots = createSlots(5);
    const subreddits = createSubreddits(3);

    const result1 = assignSubreddits(slots, subreddits, defaultConstraints, 42);
    const result2 = assignSubreddits(slots, subreddits, defaultConstraints, 42);

    expect(result1.slots.map((s) => s.subredditId)).toEqual(
      result2.slots.map((s) => s.subredditId)
    );
  });

  it('returns error for empty subreddits', () => {
    const slots = createSlots(5);

    const result = assignSubreddits(slots, [], defaultConstraints, 12345);

    expect(result.errors).toContain('No subreddits available for assignment');
  });

  it('handles high risk subreddits with lower capacity', () => {
    const slots = createSlots(4);
    const subreddits: Subreddit[] = [
      {
        id: 'low',
        name: 'r/low',
        riskLevel: 'low',
        maxPostsPerWeek: 3,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
      {
        id: 'high',
        name: 'r/high',
        riskLevel: 'high',
        maxPostsPerWeek: 3,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
    ];

    const result = assignSubreddits(slots, subreddits, defaultConstraints, 12345);

    // Count assignments
    const counts = new Map<string, number>();
    for (const slot of result.slots) {
      counts.set(slot.subredditId, (counts.get(slot.subredditId) ?? 0) + 1);
    }

    // Low risk should get more assignments due to higher effective capacity
    expect(counts.get('low')).toBeGreaterThanOrEqual(counts.get('high') ?? 0);
  });
});

describe('assignPersonas', () => {
  const createPersonas = (count: number): Persona[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `persona-${i}`,
      name: `Persona ${i}`,
      bio: null,
      tone: null,
      expertiseTags: [],
      disclosureRequired: false,
    }));

  const createSlotsWithSubreddits = (count: number) => {
    const slots = buildPostSlots(new Date('2024-01-08'), count, 12345);
    return slots.map((s) => ({ ...s, subredditId: 'sub-1' }));
  };

  it('assigns personas to all slots', () => {
    const slots = createSlotsWithSubreddits(5);
    const personas = createPersonas(3);

    const result = assignPersonas(slots, personas, 24, 12345);

    expect(result.slots).toHaveLength(5);
    expect(result.errors).toHaveLength(0);
  });

  it('respects spacing constraints', () => {
    const slots = createSlotsWithSubreddits(6);
    const personas = createPersonas(3);

    const result = assignPersonas(slots, personas, 24, 12345);
    const validation = validatePersonaSpacing(result.slots, 24);

    // Should have no violations or minimal violations
    // With 3 personas over 5 days and 24h spacing, this should be achievable
    expect(validation.violations.length).toBeLessThanOrEqual(1);
  });

  it('is deterministic with same seed', () => {
    const slots = createSlotsWithSubreddits(5);
    const personas = createPersonas(3);

    const result1 = assignPersonas(slots, personas, 24, 42);
    const result2 = assignPersonas(slots, personas, 24, 42);

    expect(result1.slots.map((s) => s.personaId)).toEqual(result2.slots.map((s) => s.personaId));
  });

  it('distributes evenly among personas', () => {
    const slots = createSlotsWithSubreddits(9);
    const personas = createPersonas(3);

    const result = assignPersonas(slots, personas, 12, 12345); // Reduced spacing for test

    // Count assignments
    const counts = new Map<string, number>();
    for (const slot of result.slots) {
      counts.set(slot.personaId, (counts.get(slot.personaId) ?? 0) + 1);
    }

    // Each persona should have about 3 assignments
    for (const count of counts.values()) {
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  it('returns error for empty personas', () => {
    const slots = createSlotsWithSubreddits(5);

    const result = assignPersonas(slots, [], 24, 12345);

    expect(result.errors).toContain('No personas available for assignment');
  });

  it('warns when spacing cannot be maintained', () => {
    // Create many slots in a short period with few personas
    const slots = createSlotsWithSubreddits(10);
    const personas = createPersonas(1); // Only 1 persona for 10 slots

    const result = assignPersonas(slots, personas, 48, 12345); // 48h spacing impossible

    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateSubredditAssignments', () => {
  it('passes for valid assignments', () => {
    const subreddits: Subreddit[] = [
      {
        id: 'sub-1',
        name: 'r/test1',
        riskLevel: 'low',
        maxPostsPerWeek: 3,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
    ];

    const slots = [
      { index: 0, scheduledAt: new Date(), dayOfWeek: 1, subredditId: 'sub-1' },
      { index: 1, scheduledAt: new Date(), dayOfWeek: 2, subredditId: 'sub-1' },
    ];

    const result = validateSubredditAssignments(slots, subreddits);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when max posts exceeded', () => {
    const subreddits: Subreddit[] = [
      {
        id: 'sub-1',
        name: 'r/test1',
        riskLevel: 'low',
        maxPostsPerWeek: 1,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
    ];

    const slots = [
      { index: 0, scheduledAt: new Date(), dayOfWeek: 1, subredditId: 'sub-1' },
      { index: 1, scheduledAt: new Date(), dayOfWeek: 2, subredditId: 'sub-1' },
    ];

    const result = validateSubredditAssignments(slots, subreddits);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('validatePersonaSpacing', () => {
  it('passes when spacing is maintained', () => {
    const now = new Date('2024-01-08T10:00:00Z');
    const slots = [
      { index: 0, scheduledAt: now, dayOfWeek: 1, personaId: 'p1' },
      {
        index: 1,
        scheduledAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        dayOfWeek: 2,
        personaId: 'p1',
      }, // 25h later
    ];

    const result = validatePersonaSpacing(slots, 24);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when spacing is violated', () => {
    const now = new Date('2024-01-08T10:00:00Z');
    const slots = [
      { index: 0, scheduledAt: now, dayOfWeek: 1, personaId: 'p1' },
      {
        index: 1,
        scheduledAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
        dayOfWeek: 1,
        personaId: 'p1',
      }, // 12h later
    ];

    const result = validatePersonaSpacing(slots, 24);

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].personaId).toBe('p1');
  });
});

describe('End-to-end planner flow', () => {
  it('produces valid weekly calendar', () => {
    const weekStart = new Date('2024-01-08');
    const subreddits: Subreddit[] = [
      {
        id: 'sub-1',
        name: 'r/startup',
        riskLevel: 'low',
        maxPostsPerWeek: 2,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
      {
        id: 'sub-2',
        name: 'r/saas',
        riskLevel: 'medium',
        maxPostsPerWeek: 2,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
      {
        id: 'sub-3',
        name: 'r/entrepreneur',
        riskLevel: 'low',
        maxPostsPerWeek: 2,
        allowedPostTypes: ['text'],
        rulesText: null,
      },
    ];
    const personas: Persona[] = [
      {
        id: 'p1',
        name: 'Alex',
        bio: null,
        tone: 'casual',
        expertiseTags: [],
        disclosureRequired: false,
      },
      {
        id: 'p2',
        name: 'Jordan',
        bio: null,
        tone: 'professional',
        expertiseTags: [],
        disclosureRequired: true,
      },
    ];
    const constraints: SlotConstraints = {
      maxPostsPerSubreddit: new Map(),
      subredditRiskLevels: new Map(),
      personaSpacingHours: 24,
      riskTolerance: 'medium',
    };

    // Step 1: Build slots
    const slots = buildPostSlots(weekStart, 5, 'week-2024-01-08');
    expect(slots).toHaveLength(5);

    // Step 2: Assign subreddits
    const withSubreddits = assignSubreddits(slots, subreddits, constraints, 'week-2024-01-08');
    expect(withSubreddits.errors).toHaveLength(0);

    // Step 3: Assign personas
    const withPersonas = assignPersonas(withSubreddits.slots, personas, 24, 'week-2024-01-08');
    expect(withPersonas.errors).toHaveLength(0);

    // Step 4: Validate
    const subValidation = validateSubredditAssignments(withSubreddits.slots, subreddits);
    expect(subValidation.valid).toBe(true);

    // Final result should have all required fields
    for (const slot of withPersonas.slots) {
      expect(slot.subredditId).toBeDefined();
      expect(slot.personaId).toBeDefined();
      expect(slot.scheduledAt).toBeInstanceOf(Date);
    }
  });
});
