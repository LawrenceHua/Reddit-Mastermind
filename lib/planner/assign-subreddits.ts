import type { PostSlot, Subreddit, SlotConstraints, SeededRandom } from './types';
import type { RiskLevel } from '@/lib/database.types';
import { createSeededRandom, stringToSeed } from './random';

interface SubredditAssignment {
  slots: Array<PostSlot & { subredditId: string }>;
  warnings: string[];
  errors: string[];
}

/**
 * Risk level weights - higher risk means fewer posts
 */
const RISK_WEIGHTS: Record<RiskLevel, number> = {
  low: 1.0,
  medium: 0.7,
  high: 0.4,
};

/**
 * Calculate effective capacity based on risk tolerance
 */
function getEffectiveCapacity(subreddit: Subreddit, riskTolerance: RiskLevel): number {
  const riskWeight = RISK_WEIGHTS[subreddit.riskLevel];
  const toleranceMultiplier = riskTolerance === 'high' ? 1.2 : riskTolerance === 'low' ? 0.8 : 1.0;

  return Math.floor(subreddit.maxPostsPerWeek * riskWeight * toleranceMultiplier);
}

/**
 * Assign subreddits to slots using weighted round-robin with constraints
 */
export function assignSubreddits(
  slots: PostSlot[],
  subreddits: Subreddit[],
  constraints: SlotConstraints,
  seed?: number | string
): SubredditAssignment {
  if (slots.length === 0) {
    return { slots: [], warnings: [], errors: [] };
  }

  if (subreddits.length === 0) {
    return {
      slots: [],
      warnings: [],
      errors: ['No subreddits available for assignment'],
    };
  }

  const effectiveSeed = typeof seed === 'string' ? stringToSeed(seed) : (seed ?? Date.now());
  const rng = createSeededRandom(effectiveSeed);

  const warnings: string[] = [];
  const errors: string[] = [];

  // Calculate effective capacities
  const capacities = new Map<string, number>();
  const remaining = new Map<string, number>();

  let totalCapacity = 0;
  for (const sub of subreddits) {
    const cap = getEffectiveCapacity(sub, constraints.riskTolerance);
    capacities.set(sub.id, cap);
    remaining.set(sub.id, cap);
    totalCapacity += cap;
  }

  // Check if we have enough capacity
  if (totalCapacity < slots.length) {
    errors.push(
      `Insufficient subreddit capacity: need ${slots.length} slots but only have ${totalCapacity} total capacity`
    );
    // We'll still try to assign what we can
  }

  // Build weighted pool
  function buildPool(): string[] {
    const pool: string[] = [];
    for (const sub of subreddits) {
      const rem = remaining.get(sub.id) ?? 0;
      if (rem > 0) {
        // Weight by remaining capacity
        for (let i = 0; i < rem; i++) {
          pool.push(sub.id);
        }
      }
    }
    return pool;
  }

  const assignedSlots: Array<PostSlot & { subredditId: string }> = [];

  for (const slot of slots) {
    const pool = buildPool();

    if (pool.length === 0) {
      warnings.push(`Could not assign subreddit to slot ${slot.index}: no capacity remaining`);
      continue;
    }

    // Shuffle pool and pick first available
    const shuffled = rng.shuffle(pool);
    const selectedId = shuffled[0];

    // Decrement remaining capacity
    remaining.set(selectedId, (remaining.get(selectedId) ?? 1) - 1);

    assignedSlots.push({
      ...slot,
      subredditId: selectedId,
    });
  }

  // Check for over-concentration warnings
  const distribution = new Map<string, number>();
  for (const slot of assignedSlots) {
    distribution.set(slot.subredditId, (distribution.get(slot.subredditId) ?? 0) + 1);
  }

  for (const [subId, count] of distribution) {
    const maxAllowed = capacities.get(subId) ?? 1;
    if (count > maxAllowed) {
      warnings.push(`Subreddit ${subId} assigned ${count} posts but max is ${maxAllowed}`);
    }
  }

  return { slots: assignedSlots, warnings, errors };
}

/**
 * Validate subreddit assignments against constraints
 */
export function validateSubredditAssignments(
  slots: Array<PostSlot & { subredditId: string }>,
  subreddits: Subreddit[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const counts = new Map<string, number>();

  for (const slot of slots) {
    counts.set(slot.subredditId, (counts.get(slot.subredditId) ?? 0) + 1);
  }

  const subMap = new Map(subreddits.map((s) => [s.id, s]));

  for (const [subId, count] of counts) {
    const sub = subMap.get(subId);
    if (!sub) {
      errors.push(`Unknown subreddit: ${subId}`);
      continue;
    }
    if (count > sub.maxPostsPerWeek) {
      errors.push(`Subreddit ${sub.name} has ${count} posts but max is ${sub.maxPostsPerWeek}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
