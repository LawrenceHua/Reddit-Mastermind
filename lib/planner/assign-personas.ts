import { differenceInHours } from 'date-fns';
import type { PostSlot, Persona, SeededRandom } from './types';
import { createSeededRandom, stringToSeed } from './random';

interface SlotWithSubreddit extends PostSlot {
  subredditId: string;
}

interface PersonaAssignment {
  slots: Array<SlotWithSubreddit & { personaId: string }>;
  warnings: string[];
  errors: string[];
}

/**
 * Assign personas to slots with spacing constraints
 *
 * Ensures:
 * - Same persona isn't assigned to slots within minSpacingHours
 * - Even distribution across personas
 * - Deterministic with seed
 */
export function assignPersonas(
  slots: SlotWithSubreddit[],
  personas: Persona[],
  minSpacingHours: number = 24,
  seed?: number | string
): PersonaAssignment {
  if (slots.length === 0) {
    return { slots: [], warnings: [], errors: [] };
  }

  if (personas.length === 0) {
    return {
      slots: [],
      warnings: [],
      errors: ['No personas available for assignment'],
    };
  }

  const effectiveSeed = typeof seed === 'string' ? stringToSeed(seed) : (seed ?? Date.now());
  const rng = createSeededRandom(effectiveSeed);

  const warnings: string[] = [];
  const errors: string[] = [];

  // Sort slots by time
  const sortedSlots = [...slots].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  // Track last assignment time per persona
  const lastAssignment = new Map<string, Date>();

  // Track assignment counts for even distribution
  const assignmentCounts = new Map<string, number>();
  for (const persona of personas) {
    assignmentCounts.set(persona.id, 0);
  }

  const assignedSlots: Array<SlotWithSubreddit & { personaId: string }> = [];

  for (const slot of sortedSlots) {
    // Find eligible personas (those that haven't posted recently)
    const eligible = personas.filter((p) => {
      const lastTime = lastAssignment.get(p.id);
      if (!lastTime) return true;
      return differenceInHours(slot.scheduledAt, lastTime) >= minSpacingHours;
    });

    if (eligible.length === 0) {
      // Fallback: use persona with oldest last assignment
      warnings.push(
        `Slot ${slot.index}: No persona available with ${minSpacingHours}h spacing, using least recent`
      );

      const sortedByLastUse = [...personas].sort((a, b) => {
        const aTime = lastAssignment.get(a.id)?.getTime() ?? 0;
        const bTime = lastAssignment.get(b.id)?.getTime() ?? 0;
        return aTime - bTime;
      });

      const selected = sortedByLastUse[0];
      lastAssignment.set(selected.id, slot.scheduledAt);
      assignmentCounts.set(selected.id, (assignmentCounts.get(selected.id) ?? 0) + 1);

      assignedSlots.push({
        ...slot,
        personaId: selected.id,
      });
      continue;
    }

    // Among eligible, prefer those with fewer assignments
    const minCount = Math.min(...eligible.map((p) => assignmentCounts.get(p.id) ?? 0));
    const leastUsed = eligible.filter((p) => (assignmentCounts.get(p.id) ?? 0) === minCount);

    // Shuffle and select
    const shuffled = rng.shuffle(leastUsed);
    const selected = shuffled[0];

    lastAssignment.set(selected.id, slot.scheduledAt);
    assignmentCounts.set(selected.id, (assignmentCounts.get(selected.id) ?? 0) + 1);

    assignedSlots.push({
      ...slot,
      personaId: selected.id,
    });
  }

  return { slots: assignedSlots, warnings, errors };
}

/**
 * Validate persona assignments against spacing constraints
 */
export function validatePersonaSpacing(
  slots: Array<PostSlot & { personaId: string }>,
  minSpacingHours: number
): {
  valid: boolean;
  violations: Array<{ personaId: string; slot1: number; slot2: number; hours: number }>;
} {
  const violations: Array<{ personaId: string; slot1: number; slot2: number; hours: number }> = [];

  // Group by persona
  const byPersona = new Map<string, Array<PostSlot & { personaId: string }>>();
  for (const slot of slots) {
    const arr = byPersona.get(slot.personaId) ?? [];
    arr.push(slot);
    byPersona.set(slot.personaId, arr);
  }

  // Check spacing within each persona's assignments
  for (const [personaId, personaSlots] of byPersona) {
    const sorted = [...personaSlots].sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
    );

    for (let i = 1; i < sorted.length; i++) {
      const hours = differenceInHours(sorted[i].scheduledAt, sorted[i - 1].scheduledAt);
      if (hours < minSpacingHours) {
        violations.push({
          personaId,
          slot1: sorted[i - 1].index,
          slot2: sorted[i].index,
          hours,
        });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}
