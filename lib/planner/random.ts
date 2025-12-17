import type { SeededRandom } from './types';

/**
 * Mulberry32 - A simple seeded PRNG
 * Deterministic and fast, suitable for reproducible test generation
 */
export function createSeededRandom(seed: number): SeededRandom {
  let state = seed;

  function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(max: number): number {
    return Math.floor(next() * max);
  }

  function shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = nextInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  return { next, nextInt, shuffle };
}

/**
 * Create a seed from a string (e.g., week identifier)
 */
export function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
