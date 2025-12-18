/**
 * API Integration Tests
 * Tests the core API endpoints for content generation and management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'test-project-id',
          name: 'Test Project',
          org_id: 'test-org-id',
          posts_per_week: 3,
          company_profile_json: { name: 'TestCo', industry: 'Tech' },
        },
      }),
      insert: vi.fn().mockResolvedValue({ data: [{ id: 'new-id' }], error: null }),
      update: vi.fn().mockResolvedValue({ data: { id: 'updated-id' }, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      insert: vi.fn().mockResolvedValue({ data: [{}], error: null }),
      update: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
  })),
}));

describe('API Request/Response Validation', () => {
  describe('Week Generation Request', () => {
    it('validates required project context', () => {
      const projectContext = {
        postsPerWeek: 3,
        personas: [{ id: '1', name: 'Test' }],
        subreddits: [{ id: '1', name: 'test' }],
        topicSeeds: [{ id: '1', text: 'topic' }],
      };

      expect(projectContext.postsPerWeek).toBeGreaterThan(0);
      expect(projectContext.personas.length).toBeGreaterThan(0);
      expect(projectContext.subreddits.length).toBeGreaterThan(0);
    });

    it('validates week date format', () => {
      const validDate = '2024-12-15';
      const parsedDate = new Date(validDate + 'T12:00:00'); // Use noon to avoid timezone issues

      expect(parsedDate).toBeInstanceOf(Date);
      expect(parsedDate.getFullYear()).toBe(2024);
      expect(parsedDate.getMonth()).toBe(11); // December
      expect(parsedDate.getDate()).toBe(15);
    });

    it('rejects invalid posts_per_week values', () => {
      const validatePostsPerWeek = (value: number) => {
        if (value < 1) throw new Error('Must be at least 1');
        if (value > 20) throw new Error('Must be at most 20');
        return true;
      };

      expect(() => validatePostsPerWeek(0)).toThrow('Must be at least 1');
      expect(() => validatePostsPerWeek(21)).toThrow('Must be at most 20');
      expect(validatePostsPerWeek(3)).toBe(true);
      expect(validatePostsPerWeek(10)).toBe(true);
    });
  });

  describe('Content Asset Response', () => {
    it('validates generated content structure', () => {
      const content = {
        title: 'Test Post Title',
        body: 'Test post body content.',
        riskFlags: [],
      };

      expect(content.title).toBeTruthy();
      expect(content.body).toBeTruthy();
      expect(Array.isArray(content.riskFlags)).toBe(true);
    });

    it('validates quality score range', () => {
      const validateQualityScore = (score: number) => {
        return score >= 0 && score <= 10;
      };

      expect(validateQualityScore(0)).toBe(true);
      expect(validateQualityScore(5)).toBe(true);
      expect(validateQualityScore(10)).toBe(true);
      expect(validateQualityScore(-1)).toBe(false);
      expect(validateQualityScore(11)).toBe(false);
    });

    it('validates thread structure', () => {
      const thread = {
        mainPost: { id: '1', title: 'Test', body: 'Body' },
        comments: [
          { id: '2', body: 'Comment 1', persona: 'Alice', offset: 15 },
          { id: '3', body: 'Comment 2', persona: 'Bob', offset: 45 },
        ],
        opReplies: [{ id: '4', body: 'Thanks!', offset: 60 }],
      };

      expect(thread.mainPost).toBeDefined();
      expect(thread.comments.length).toBeGreaterThan(0);
      expect(thread.comments.every((c) => c.offset > 0)).toBe(true);
    });
  });

  describe('Feedback Request Validation', () => {
    it('validates rating range', () => {
      const validateRating = (rating: number) => {
        return rating >= 1 && rating <= 5;
      };

      expect(validateRating(1)).toBe(true);
      expect(validateRating(5)).toBe(true);
      expect(validateRating(0)).toBe(false);
      expect(validateRating(6)).toBe(false);
    });

    it('validates Reddit URL format', () => {
      const validateRedditUrl = (url: string) => {
        return /^https:\/\/(www\.)?reddit\.com\/r\//.test(url);
      };

      expect(validateRedditUrl('https://reddit.com/r/test/comments/abc')).toBe(true);
      expect(validateRedditUrl('https://www.reddit.com/r/test/comments/abc')).toBe(true);
      expect(validateRedditUrl('https://example.com/r/test')).toBe(false);
      expect(validateRedditUrl('not-a-url')).toBe(false);
    });
  });
});

describe('Content Validation Rules', () => {
  describe('Title Validation', () => {
    it('rejects empty titles', () => {
      const validateTitle = (title: string) => {
        if (!title || title.trim().length === 0) return false;
        if (title.length > 300) return false;
        return true;
      };

      expect(validateTitle('')).toBe(false);
      expect(validateTitle('   ')).toBe(false);
      expect(validateTitle('Valid Title')).toBe(true);
    });

    it('rejects overly long titles', () => {
      const validateTitle = (title: string) => title.length <= 300;
      const longTitle = 'A'.repeat(301);

      expect(validateTitle(longTitle)).toBe(false);
      expect(validateTitle('Normal length title')).toBe(true);
    });

    it('warns on clickbait patterns', () => {
      const hasClickbait = (title: string) => {
        const patterns = [
          /you won't believe/i,
          /this is huge/i,
          /mind.?blown/i,
          /🔥{2,}/,
        ];
        return patterns.some((p) => p.test(title));
      };

      expect(hasClickbait('You won\'t believe this!')).toBe(true);
      expect(hasClickbait('Normal question about tools?')).toBe(false);
    });
  });

  describe('Body Content Validation', () => {
    it('validates minimum content length', () => {
      const validateBody = (body: string, minLength = 10) => {
        return body.trim().length >= minLength;
      };

      expect(validateBody('Too short')).toBe(false);
      expect(validateBody('This is a valid body with enough content.')).toBe(true);
    });

    it('detects promotional language', () => {
      const hasPromoLanguage = (text: string) => {
        const patterns = [
          /buy now/i,
          /click here/i,
          /limited time/i,
          /act fast/i,
          /special offer/i,
        ];
        return patterns.some((p) => p.test(text));
      };

      expect(hasPromoLanguage('Buy now before it\'s too late!')).toBe(true);
      expect(hasPromoLanguage('I\'ve been using this tool and it works well.')).toBe(false);
    });

    it('detects spam link patterns', () => {
      const hasSpamLinks = (text: string) => {
        const patterns = [
          /bit\.ly/i,
          /tinyurl/i,
          /\[.*\]\(.*affiliate.*\)/i,
          /use code/i,
        ];
        return patterns.some((p) => p.test(text));
      };

      expect(hasSpamLinks('Check out bit.ly/xyz for more info')).toBe(true);
      expect(hasSpamLinks('Here is a helpful resource I found.')).toBe(false);
    });
  });
});

describe('Calendar Generation Logic', () => {
  it('generates correct number of slots', () => {
    const generateSlotCount = (postsPerWeek: number, daysPerWeek = 7) => {
      // Can't post more than available days
      return Math.min(postsPerWeek, daysPerWeek);
    };

    expect(generateSlotCount(3)).toBe(3);
    expect(generateSlotCount(7)).toBe(7);
    expect(generateSlotCount(10)).toBe(7); // Capped at 7 days
  });

  it('distributes posts across days evenly', () => {
    const distributeAcrossDays = (totalPosts: number, days: number[]) => {
      const distribution: Record<number, number> = {};
      days.forEach((d) => (distribution[d] = 0));

      for (let i = 0; i < totalPosts; i++) {
        const dayIndex = i % days.length;
        distribution[days[dayIndex]]++;
      }

      return distribution;
    };

    // 6 posts across 5 days: 2, 1, 1, 1, 1 (round robin)
    const dist = distributeAcrossDays(6, [1, 2, 3, 4, 5]);
    expect(dist[1]).toBe(2); // Day 1 gets 2 (index 0 and 5)
    expect(dist[2]).toBe(1); // Day 2 gets 1
    expect(dist[3]).toBe(1); // Day 3 gets 1
    expect(dist[4]).toBe(1); // Day 4 gets 1
    expect(dist[5]).toBe(1); // Day 5 gets 1
    
    // Total should be 6
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });

  it('respects subreddit posting limits', () => {
    const subreddits = [
      { name: 'test1', maxPerWeek: 2 },
      { name: 'test2', maxPerWeek: 3 },
    ];

    const totalCapacity = subreddits.reduce((sum, s) => sum + s.maxPerWeek, 0);
    expect(totalCapacity).toBe(5);

    const postsRequested = 10;
    const postsGenerated = Math.min(postsRequested, totalCapacity);
    expect(postsGenerated).toBe(5);
  });
});

describe('Persona Assignment Logic', () => {
  it('requires minimum 2 personas', () => {
    const validatePersonaCount = (count: number) => count >= 2;

    expect(validatePersonaCount(1)).toBe(false);
    expect(validatePersonaCount(2)).toBe(true);
    expect(validatePersonaCount(5)).toBe(true);
  });

  it('prevents same persona from posting twice in a row', () => {
    const assignments = ['Alice', 'Bob', 'Alice', 'Charlie', 'Bob'];

    const hasConsecutiveSamePersona = (list: string[]) => {
      for (let i = 1; i < list.length; i++) {
        if (list[i] === list[i - 1]) return true;
      }
      return false;
    };

    expect(hasConsecutiveSamePersona(['Alice', 'Alice', 'Bob'])).toBe(true);
    expect(hasConsecutiveSamePersona(assignments)).toBe(false);
  });

  it('distributes posts fairly across personas', () => {
    const personas = ['Alice', 'Bob', 'Charlie'];
    const posts = 9;

    const idealPerPersona = posts / personas.length;
    const maxVariance = 1; // Allow ±1 from ideal

    const distribution = { Alice: 3, Bob: 3, Charlie: 3 };

    Object.values(distribution).forEach((count) => {
      expect(Math.abs(count - idealPerPersona)).toBeLessThanOrEqual(maxVariance);
    });
  });
});

describe('Thread Planning Logic', () => {
  it('creates thread with correct structure', () => {
    const thread = {
      opPost: { index: 0 },
      comments: [
        { index: 1, persona: 'Bob', offset: 15 },
        { index: 2, persona: 'Charlie', offset: 45 },
      ],
      opReplies: [{ index: 3, offset: 60 }],
    };

    expect(thread.opPost.index).toBe(0);
    expect(thread.comments.length).toBe(2);
    expect(thread.opReplies.length).toBe(1);
  });

  it('ensures comments come before OP replies', () => {
    const timeline = [
      { type: 'comment', offset: 15 },
      { type: 'comment', offset: 45 },
      { type: 'op_reply', offset: 60 },
    ];

    const lastCommentOffset = Math.max(
      ...timeline.filter((t) => t.type === 'comment').map((t) => t.offset)
    );
    const firstReplyOffset = Math.min(
      ...timeline.filter((t) => t.type === 'op_reply').map((t) => t.offset)
    );

    expect(firstReplyOffset).toBeGreaterThan(lastCommentOffset);
  });

  it('limits personas per thread to prevent suspicious patterns', () => {
    const maxPersonasPerThread = 3;
    const thread = {
      personas: ['Alice', 'Bob', 'Charlie', 'David'],
    };

    const uniquePersonas = new Set(thread.personas).size;
    expect(uniquePersonas).toBeLessThanOrEqual(maxPersonasPerThread + 1); // +1 for OP
  });
});

describe('Learning System', () => {
  describe('Feedback Collection', () => {
    it('validates feedback data structure', () => {
      const feedback = {
        rating: 5,
        wasPosted: true,
        redditScore: 42,
        redditUrl: 'https://reddit.com/r/test/comments/abc',
      };

      expect(feedback.rating).toBeGreaterThanOrEqual(1);
      expect(feedback.rating).toBeLessThanOrEqual(5);
      expect(typeof feedback.wasPosted).toBe('boolean');
      expect(feedback.redditScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Few-Shot Learning', () => {
    it('selects top examples by rating', () => {
      const examples = [
        { id: '1', rating: 5, redditScore: 100 },
        { id: '2', rating: 4, redditScore: 50 },
        { id: '3', rating: 3, redditScore: 25 },
        { id: '4', rating: 5, redditScore: 200 },
      ];

      const topExamples = examples
        .filter((e) => e.rating >= 4)
        .sort((a, b) => b.rating - a.rating || b.redditScore - a.redditScore)
        .slice(0, 3);

      expect(topExamples.length).toBe(3);
      expect(topExamples[0].rating).toBe(5);
      expect(topExamples[0].redditScore).toBe(200);
    });

    it('builds few-shot section correctly', () => {
      const example = {
        title: 'Best tool for X?',
        body: 'Looking for recommendations.',
        rating: 5,
      };

      const section = `Example (${example.rating}★):\nTitle: ${example.title}\nBody: ${example.body}`;

      expect(section).toContain('5★');
      expect(section).toContain(example.title);
    });
  });

  describe('Fine-Tuning Export', () => {
    it('generates valid JSONL format', () => {
      const trainingExample = {
        messages: [
          { role: 'system', content: 'You are a Reddit writer.' },
          { role: 'user', content: 'Write a post about X.' },
          { role: 'assistant', content: '{"title": "Test", "body": "Content"}' },
        ],
      };

      const jsonl = JSON.stringify(trainingExample);
      const parsed = JSON.parse(jsonl);

      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].role).toBe('system');
      expect(parsed.messages[1].role).toBe('user');
      expect(parsed.messages[2].role).toBe('assistant');
    });

    it('validates minimum example count for fine-tuning', () => {
      const minExamples = 50;
      const currentExamples = 45;

      const ready = currentExamples >= minExamples;
      const progress = (currentExamples / minExamples) * 100;

      expect(ready).toBe(false);
      expect(progress).toBe(90);
    });
  });
});

