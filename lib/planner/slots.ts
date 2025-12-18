import { addDays, setHours, setMinutes, startOfWeek } from 'date-fns';
import type { PostSlot, SeededRandom } from './types';
import { createSeededRandom, stringToSeed } from './random';

/**
 * Default posting hours - spread throughout the day for better engagement
 */
const DEFAULT_POSTING_HOURS = [9, 11, 14, 16, 19]; // 9am, 11am, 2pm, 4pm, 7pm

/**
 * Build deterministic post slots for a week
 * Spreads posts across days and times for optimal distribution
 */
export function buildPostSlots(
  weekStartDate: Date,
  postsPerWeek: number,
  seed?: number | string
): PostSlot[] {
  if (postsPerWeek <= 0) {
    return [];
  }

  // Create seeded RNG for deterministic results
  const effectiveSeed =
    typeof seed === 'string'
      ? stringToSeed(seed)
      : (seed ?? stringToSeed(weekStartDate.toISOString()));
  const rng = createSeededRandom(effectiveSeed);

  // Ensure week starts on Monday (1) for business week focus
  const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 0 });

  // Available days: Monday-Friday (0-4 relative to week start)
  // Can extend to include weekend if needed
  const availableDays = [0, 1, 2, 3, 4]; // Mon, Tue, Wed, Thu, Fri

  const slots: PostSlot[] = [];

  // Distribute posts across days as evenly as possible
  const postsPerDay = Math.floor(postsPerWeek / availableDays.length);
  const extraPosts = postsPerWeek % availableDays.length;

  // Shuffle days for randomness in extra post distribution
  const shuffledDays = rng.shuffle(availableDays);

  let slotIndex = 0;
  for (let i = 0; i < availableDays.length; i++) {
    const dayOffset = availableDays[i];
    const day = addDays(weekStart, dayOffset);
    const dayOfWeek = day.getDay();

    // Calculate posts for this day
    const postsThisDay = postsPerDay + (shuffledDays.indexOf(dayOffset) < extraPosts ? 1 : 0);

    if (postsThisDay === 0) continue;

    // Select hours for this day
    const shuffledHours = rng.shuffle([...DEFAULT_POSTING_HOURS]);
    const selectedHours = shuffledHours.slice(0, postsThisDay);

    // Sort hours so posts are in chronological order
    selectedHours.sort((a, b) => a - b);

    for (const hour of selectedHours) {
      // Add some minute variance (0-30 minutes)
      const minutes = rng.nextInt(31);

      const scheduledAt = setMinutes(setHours(day, hour), minutes);

      slots.push({
        index: slotIndex++,
        scheduledAt,
        dayOfWeek,
      });
    }
  }

  // Sort by scheduled time
  slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  // Re-index after sorting
  return slots.map((slot, idx) => ({ ...slot, index: idx }));
}

/**
 * Get the optimal posting times for a specific day
 */
export function getOptimalPostingTimes(date: Date, count: number, rng: SeededRandom): Date[] {
  const shuffledHours = rng.shuffle([...DEFAULT_POSTING_HOURS]);
  const selectedHours = shuffledHours.slice(0, Math.min(count, DEFAULT_POSTING_HOURS.length));

  return selectedHours
    .sort((a, b) => a - b)
    .map((hour) => {
      const minutes = rng.nextInt(31);
      return setMinutes(setHours(date, hour), minutes);
    });
}
