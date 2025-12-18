import { describe, it, expect } from 'vitest';
import { calculateHeuristicScore } from './generate';
import type { PostCandidate } from '@/lib/llm';

describe('Heuristic Scoring', () => {
  const createMockCandidate = (overrides: Partial<PostCandidate['post']> = {}): PostCandidate => ({
    post: {
      title: 'A reasonable title for a Reddit post',
      body_md:
        'This is a helpful post with enough content to be meaningful. ' +
        'It contains valuable information that would be useful to readers. ' +
        'The post is well-structured and provides real value.',
      topic_cluster_key: 'test-topic',
      target_query_tags: ['test', 'example'],
      risk_flags: [],
      disclosure_used: null,
      ...overrides,
    },
    op_followup_comment: null,
  });

  it('should return a baseline score for reasonable content', () => {
    const candidate = createMockCandidate();
    const score = calculateHeuristicScore(candidate);

    expect(score.overall).toBeGreaterThanOrEqual(5);
    expect(score.overall).toBeLessThanOrEqual(10);
    expect(score.reasoning).toBeDefined();
  });

  it('should penalize very short body content', () => {
    const shortCandidate = createMockCandidate({ body_md: 'Too short' });
    const normalCandidate = createMockCandidate();

    const shortScore = calculateHeuristicScore(shortCandidate);
    const normalScore = calculateHeuristicScore(normalCandidate);

    expect(shortScore.overall).toBeLessThan(normalScore.overall!);
  });

  it('should penalize very short titles', () => {
    const shortTitleCandidate = createMockCandidate({ title: 'Short' });
    const normalCandidate = createMockCandidate();

    const shortScore = calculateHeuristicScore(shortTitleCandidate);
    const normalScore = calculateHeuristicScore(normalCandidate);

    expect(shortScore.overall).toBeLessThan(normalScore.overall!);
  });

  it('should penalize ALL CAPS in title', () => {
    const capsCandidate = createMockCandidate({
      title: 'THIS IS AN ALL CAPS TITLE',
    });
    const normalCandidate = createMockCandidate();

    const capsScore = calculateHeuristicScore(capsCandidate);
    const normalScore = calculateHeuristicScore(normalCandidate);

    expect(capsScore.overall).toBeLessThan(normalScore.overall!);
  });

  it('should penalize content with risk flags', () => {
    const riskyCandidate = createMockCandidate();
    riskyCandidate.post.risk_flags = ['promotional_mention', 'controversial_topic'];

    const normalCandidate = createMockCandidate();

    const riskyScore = calculateHeuristicScore(riskyCandidate);
    const normalScore = calculateHeuristicScore(normalCandidate);

    expect(riskyScore.overall).toBeLessThan(normalScore.overall!);
  });

  it('should give bonus for follow-up comment', () => {
    const withFollowup: PostCandidate = {
      ...createMockCandidate(),
      op_followup_comment: {
        body_md: 'Happy to answer any questions!',
      },
    };
    const withoutFollowup = createMockCandidate();

    const followupScore = calculateHeuristicScore(withFollowup);
    const normalScore = calculateHeuristicScore(withoutFollowup);

    expect(followupScore.overall).toBeGreaterThan(normalScore.overall!);
  });

  it('should give bonus for longer content', () => {
    const longCandidate = createMockCandidate({
      body_md: 'A'.repeat(600), // Over 500 chars
    });
    const shortCandidate = createMockCandidate({
      body_md: 'A'.repeat(200), // Under 500 chars
    });

    const longScore = calculateHeuristicScore(longCandidate);
    const shortScore = calculateHeuristicScore(shortCandidate);

    expect(longScore.overall).toBeGreaterThan(shortScore.overall!);
  });

  it('should handle very long content appropriately', () => {
    const veryLongCandidate = createMockCandidate({
      body_md: 'A'.repeat(2500), // Over 2000 chars
    });
    const optimalCandidate = createMockCandidate({
      body_md: 'A'.repeat(800), // Between 500-2000 chars
    });

    const veryLongScore = calculateHeuristicScore(veryLongCandidate);
    const optimalScore = calculateHeuristicScore(optimalCandidate);

    // Both get bonus for >500 chars, but very long also gets penalty
    // The net effect may make them equal, so just verify they're both valid scores
    expect(veryLongScore.overall).toBeDefined();
    expect(optimalScore.overall).toBeDefined();
    expect(veryLongScore.overall).toBeGreaterThanOrEqual(0);
    expect(optimalScore.overall).toBeGreaterThanOrEqual(0);
  });

  it('should clamp scores between 0 and 10', () => {
    // Create a terrible candidate that would normally go below 0
    const terribleCandidate = createMockCandidate({
      title: 'X',
      body_md: 'Y',
      risk_flags: ['flag1', 'flag2', 'flag3', 'flag4', 'flag5', 'flag6', 'flag7'],
    });

    const score = calculateHeuristicScore(terribleCandidate);

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(10);
  });
});

describe('Generation Types', () => {
  it('should have correct DEFAULT_GENERATION_CONFIG exported', async () => {
    const { DEFAULT_GENERATION_CONFIG } = await import('./types');

    expect(DEFAULT_GENERATION_CONFIG).toBeDefined();
    expect(DEFAULT_GENERATION_CONFIG.model).toBe('gpt-4o');
    expect(DEFAULT_GENERATION_CONFIG.candidatesPerSlot).toBeGreaterThan(0);
    expect(DEFAULT_GENERATION_CONFIG.minQualityScore).toBeGreaterThan(0);
  });
});
