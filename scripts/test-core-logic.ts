#!/usr/bin/env tsx
/**
 * Core Business Logic Tests
 * Tests planner, validators, and generation logic in isolation
 * Run with: npx tsx scripts/test-core-logic.ts
 */

import { generateWeekSlots } from '../lib/planner/slots';
import { assignSubreddits } from '../lib/planner/assign-subreddits';
import { assignPersonas } from '../lib/planner/assign-personas';
import { 
  validateContent, 
  hasCriticalFlags,
  validateNoVoteManipulationLanguage,
  validateNoSpamLinks,
  validateDisclosurePresent 
} from '../lib/validators';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true, message: 'OK' });
    console.log(`  ✅ ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, message: error.message });
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value: boolean, msg?: string) {
  if (!value) {
    throw new Error(msg || 'Expected true but got false');
  }
}

function assertFalse(value: boolean, msg?: string) {
  if (value) {
    throw new Error(msg || 'Expected false but got true');
  }
}

// ==========================================
// Planner Tests
// ==========================================
console.log('\n📅 Planner - Slot Generation\n');

test('generateWeekSlots creates correct number of slots', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots = generateWeekSlots(weekStart, 5, 'test-seed');
  assertEqual(slots.length, 5, 'Should generate 5 slots for 5 posts per week');
});

test('generateWeekSlots slots are within Mon-Fri', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots = generateWeekSlots(weekStart, 10, 'test-seed');
  
  for (const slot of slots) {
    const day = slot.scheduledAt.getUTCDay();
    assertTrue(day >= 1 && day <= 5, `Slot on day ${day} is outside Mon-Fri`);
  }
});

test('generateWeekSlots with same seed produces identical results', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots1 = generateWeekSlots(weekStart, 5, 'deterministic-seed');
  const slots2 = generateWeekSlots(weekStart, 5, 'deterministic-seed');
  
  for (let i = 0; i < slots1.length; i++) {
    assertEqual(
      slots1[i].scheduledAt.toISOString(), 
      slots2[i].scheduledAt.toISOString(),
      'Same seed should produce identical times'
    );
  }
});

test('generateWeekSlots different seeds produce different results', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots1 = generateWeekSlots(weekStart, 5, 'seed-a');
  const slots2 = generateWeekSlots(weekStart, 5, 'seed-b');
  
  // At least some slots should differ
  let differences = 0;
  for (let i = 0; i < slots1.length; i++) {
    if (slots1[i].scheduledAt.toISOString() !== slots2[i].scheduledAt.toISOString()) {
      differences++;
    }
  }
  assertTrue(differences > 0, 'Different seeds should produce different times');
});

// ==========================================
// Subreddit Assignment Tests
// ==========================================
console.log('\n📊 Planner - Subreddit Assignment\n');

const mockSubreddits = [
  { id: 'sr1', name: 'r/test1', risk_level: 'low' as const, max_posts_per_week: 3 },
  { id: 'sr2', name: 'r/test2', risk_level: 'medium' as const, max_posts_per_week: 2 },
  { id: 'sr3', name: 'r/test3', risk_level: 'high' as const, max_posts_per_week: 1 },
];

test('assignSubreddits respects risk tolerance', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots = generateWeekSlots(weekStart, 5, 'test');
  
  const assignments = assignSubreddits(slots, mockSubreddits, 'low', 'test');
  
  // With low risk tolerance, should only use low-risk subreddit
  for (const slot of assignments) {
    const sr = mockSubreddits.find(s => s.id === slot.subredditId);
    assertEqual(sr?.risk_level, 'low', 'Low risk tolerance should only use low-risk subreddits');
  }
});

test('assignSubreddits respects max_posts_per_week', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots = generateWeekSlots(weekStart, 10, 'test');
  
  const assignments = assignSubreddits(slots, mockSubreddits, 'high', 'test');
  
  // Count posts per subreddit
  const counts: Record<string, number> = {};
  for (const slot of assignments) {
    counts[slot.subredditId!] = (counts[slot.subredditId!] || 0) + 1;
  }
  
  // Verify limits
  for (const sr of mockSubreddits) {
    const count = counts[sr.id] || 0;
    assertTrue(count <= sr.max_posts_per_week, 
      `${sr.name} has ${count} posts but max is ${sr.max_posts_per_week}`);
  }
});

// ==========================================
// Persona Assignment Tests  
// ==========================================
console.log('\n👤 Planner - Persona Assignment\n');

const mockPersonas = [
  { id: 'p1', name: 'Expert Dave', active: true },
  { id: 'p2', name: 'Casual Casey', active: true },
  { id: 'p3', name: 'Inactive Ian', active: false },
];

test('assignPersonas only uses active personas', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots = generateWeekSlots(weekStart, 5, 'test');
  const withSubreddits = slots.map((s, i) => ({ ...s, subredditId: 'sr1' }));
  
  const assignments = assignPersonas(withSubreddits, mockPersonas, 'test');
  
  for (const slot of assignments) {
    const persona = mockPersonas.find(p => p.id === slot.personaId);
    assertTrue(persona?.active !== false, 'Should not use inactive personas');
  }
});

test('assignPersonas distributes personas across slots', () => {
  const weekStart = new Date('2025-01-06T00:00:00Z');
  const slots = generateWeekSlots(weekStart, 10, 'test');
  const withSubreddits = slots.map((s, i) => ({ ...s, subredditId: 'sr1' }));
  
  const assignments = assignPersonas(withSubreddits, mockPersonas, 'test');
  
  // Count usage
  const counts: Record<string, number> = {};
  for (const slot of assignments) {
    counts[slot.personaId!] = (counts[slot.personaId!] || 0) + 1;
  }
  
  // Should use multiple personas (not just one)
  const usedPersonas = Object.keys(counts).length;
  assertTrue(usedPersonas >= 2, `Should use multiple personas, but only used ${usedPersonas}`);
});

// ==========================================
// Validator Tests
// ==========================================
console.log('\n🛡️ Validators - Content Safety\n');

test('validateNoVoteManipulationLanguage catches upvote requests', () => {
  const result = validateNoVoteManipulationLanguage(
    'This is great! Please upvote if you agree!',
    ''
  );
  assertTrue(result.flags.includes('vote_manipulation'), 'Should flag upvote request');
});

test('validateNoVoteManipulationLanguage allows normal content', () => {
  const result = validateNoVoteManipulationLanguage(
    'I found this tool really helpful for my workflow.',
    ''
  );
  assertFalse(result.flags.includes('vote_manipulation'), 'Should not flag normal content');
});

test('validateNoSpamLinks catches URL shorteners', () => {
  const result = validateNoSpamLinks(
    'Check this out: bit.ly/suspicious',
    ''
  );
  assertTrue(result.flags.includes('url_shortener'), 'Should flag URL shortener');
});

test('validateNoSpamLinks catches excessive links', () => {
  const content = `
    Link 1: https://example.com/1
    Link 2: https://example.com/2
    Link 3: https://example.com/3
    Link 4: https://example.com/4
    Link 5: https://example.com/5
  `;
  const result = validateNoSpamLinks(content, '');
  assertTrue(result.flags.includes('excessive_links'), 'Should flag excessive links');
});

test('validateDisclosurePresent detects proper disclosure', () => {
  const result = validateDisclosurePresent(
    'I work at Acme Corp, so take this with a grain of salt, but...',
    ''
  );
  assertFalse(result.flags.includes('missing_disclosure'), 'Should not flag when disclosure present');
});

test('validateContent aggregates multiple validators', () => {
  const result = validateContent(
    'Please upvote! Check bit.ly/spam',
    ''
  );
  
  assertTrue(hasCriticalFlags(result.flags), 'Should have critical flags');
  assertTrue(result.flags.length >= 2, 'Should have multiple flags');
});

// ==========================================
// Thread Planning Tests
// ==========================================
console.log('\n💬 Thread Planning\n');

// Import thread planning module
import { generateThreadPlan } from '../lib/planner/thread';

test('generateThreadPlan creates OP post and comments', () => {
  const personas = [
    { id: 'op', name: 'Original Poster', active: true },
    { id: 'commenter1', name: 'Commenter 1', active: true },
    { id: 'commenter2', name: 'Commenter 2', active: true },
  ];
  
  const postSlot = {
    scheduledAt: new Date('2025-01-06T10:00:00Z'),
    subredditId: 'sr1',
    personaId: 'op',
  };
  
  const plan = generateThreadPlan(postSlot, personas, { commentCount: 2 });
  
  assertTrue(plan.opPost !== undefined, 'Should have OP post');
  assertTrue(plan.comments.length === 2, 'Should have 2 comments');
});

test('generateThreadPlan assigns different personas to comments', () => {
  const personas = [
    { id: 'op', name: 'Original Poster', active: true },
    { id: 'c1', name: 'Commenter 1', active: true },
    { id: 'c2', name: 'Commenter 2', active: true },
  ];
  
  const postSlot = {
    scheduledAt: new Date('2025-01-06T10:00:00Z'),
    subredditId: 'sr1',
    personaId: 'op',
  };
  
  const plan = generateThreadPlan(postSlot, personas, { commentCount: 2 });
  
  // Check that commenters are not the OP
  for (const comment of plan.comments) {
    assertTrue(comment.personaId !== 'op' || comment.role === 'op_reply', 
      'Non-OP-reply comments should be from different personas');
  }
});

test('generateThreadPlan includes time offsets', () => {
  const personas = [
    { id: 'op', name: 'OP', active: true },
    { id: 'c1', name: 'C1', active: true },
  ];
  
  const postSlot = {
    scheduledAt: new Date('2025-01-06T10:00:00Z'),
    subredditId: 'sr1',
    personaId: 'op',
  };
  
  const plan = generateThreadPlan(postSlot, personas, { commentCount: 1 });
  
  // Comments should have positive time offsets
  for (const comment of plan.comments) {
    assertTrue(comment.offsetMinutes > 0, 'Comments should have positive time offset from OP post');
  }
});

// ==========================================
// Summary
// ==========================================
console.log('\n' + '='.repeat(50));

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.failed).length;

console.log(`\n📊 Results: ${passed} passed, ${results.length - passed} failed\n`);

if (results.some(r => !r.passed)) {
  console.log('Failed tests:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  - ${r.name}: ${r.message}`);
  });
  process.exit(1);
} else {
  console.log('✅ All core logic tests passed!\n');
}

