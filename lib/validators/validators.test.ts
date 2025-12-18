import { describe, it, expect } from 'vitest';
import { validateNoVoteManipulationLanguage } from './vote-manipulation';
import { validateNoSpamLinks, validateSubredditLinkPolicy } from './spam-links';
import {
  validateNoUndisclosedAffiliationClaims,
  validateDisclosurePresent,
} from './affiliation';
import { validateContent, hasCriticalFlags } from './index';

describe('Vote Manipulation Validator', () => {
  it('should detect "upvote if" patterns', () => {
    const result = validateNoVoteManipulationLanguage({
      body: 'Upvote if you agree with this!',
    });
    expect(result.valid).toBe(false);
    expect(result.flags).toContain('vote_manipulation');
  });

  it('should detect "please upvote" patterns', () => {
    const result = validateNoVoteManipulationLanguage({
      body: 'Please upvote this post for visibility',
    });
    expect(result.valid).toBe(false);
  });

  it('should detect indirect manipulation via "smash that upvote"', () => {
    const result = validateNoVoteManipulationLanguage({
      body: "Don't forget to smash that upvote button if you found this helpful",
    });
    expect(result.valid).toBe(false);
  });

  it('should pass neutral voting discussion', () => {
    const result = validateNoVoteManipulationLanguage({
      body: 'Reddit uses votes to rank content. The voting system helps surface quality posts.',
    });
    // Should be valid with no manipulation patterns
    expect(result.valid).toBe(true);
  });

  it('should detect karma farming language', () => {
    const result = validateNoVoteManipulationLanguage({
      body: 'Help me get karma! Every upvote counts!',
    });
    expect(result.valid).toBe(false);
  });

  it('should pass clean content', () => {
    const result = validateNoVoteManipulationLanguage({
      body: 'Here is my guide to React hooks. I hope you find it useful for your projects.',
    });
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect coordination patterns', () => {
    const result = validateNoVoteManipulationLanguage({
      body: "Everyone upvote this post so we can get it to the front page!",
    });
    expect(result.valid).toBe(false);
    expect(result.flags).toContain('coordinated_voting');
  });

  it('should check title as well as body', () => {
    const result = validateNoVoteManipulationLanguage({
      title: 'Upvote if you love React!',
      body: 'Here is some content...',
    });
    expect(result.valid).toBe(false);
  });
});

describe('Spam Link Validator', () => {
  it('should detect URL shorteners', () => {
    const result = validateNoSpamLinks({
      body: 'Check out https://bit.ly/abc123 for more info',
    });
    expect(result.flags).toContain('url_shortener');
  });

  it('should detect multiple shorteners', () => {
    const result = validateNoSpamLinks({
      body: 'Links: https://tinyurl.com/x, https://t.co/y, https://goo.gl/z',
    });
    expect(result.flags).toContain('url_shortener');
  });

  it('should detect affiliate links', () => {
    const result = validateNoSpamLinks({
      body: 'Buy it here: https://amazon.com/product?tag=myaffiliate-20',
    });
    expect(result.flags).toContain('affiliate_link');
  });

  it('should detect referral codes in URLs', () => {
    const result = validateNoSpamLinks({
      body: 'Sign up with my link: https://example.com?ref=user123',
    });
    expect(result.flags).toContain('affiliate_link');
  });

  it('should pass legitimate links', () => {
    const result = validateNoSpamLinks({
      body: 'Check out the official docs at https://react.dev/learn and the GitHub repo at https://github.com/facebook/react',
    });
    expect(result.flags).not.toContain('url_shortener');
    expect(result.flags).not.toContain('affiliate_link');
    expect(result.valid).toBe(true);
  });

  it('should warn about excessive links', () => {
    const result = validateNoSpamLinks({
      body:
        'Here are resources:\n' +
        'https://a.com https://b.com https://c.com https://d.com',
    });
    expect(result.flags).toContain('many_links');
  });

  it('should return valid for content without links', () => {
    const result = validateNoSpamLinks({
      body: 'This is just text without any links.',
    });
    expect(result.valid).toBe(true);
    expect(result.flags.length).toBe(0);
  });
});

describe('Subreddit Link Policy Validator', () => {
  it('should fail when link in text-only subreddit', () => {
    const result = validateSubredditLinkPolicy(
      { body: 'Check out https://example.com' },
      ['text']
    );
    expect(result.valid).toBe(false);
    expect(result.flags).toContain('link_policy_violation');
  });

  it('should pass when no links in text-only subreddit', () => {
    const result = validateSubredditLinkPolicy({ body: 'Just text content' }, ['text']);
    expect(result.valid).toBe(true);
  });

  it('should fail when no links in link-required subreddit', () => {
    const result = validateSubredditLinkPolicy({ body: 'No links here' }, ['link']);
    expect(result.valid).toBe(false);
  });

  it('should pass when links allowed and present', () => {
    const result = validateSubredditLinkPolicy(
      { body: 'Check out https://example.com' },
      ['text', 'link']
    );
    expect(result.valid).toBe(true);
  });
});

describe('Affiliation Validator', () => {
  it('should detect fake neutrality claims', () => {
    const result = validateNoUndisclosedAffiliationClaims({
      body: "I'm not affiliated with this company, but their product is amazing!",
    });
    expect(result.flags).toContain('fake_neutrality');
    expect(result.valid).toBe(false);
  });

  it('should detect "just a satisfied customer" patterns', () => {
    const result = validateNoUndisclosedAffiliationClaims({
      body: "I'm just a happy customer sharing my experience",
    });
    expect(result.flags).toContain('fake_neutrality');
  });

  it('should warn about astroturfing language', () => {
    const result = validateNoUndisclosedAffiliationClaims({
      body: 'We should all try this amazing product!',
    });
    expect(result.flags).toContain('potential_astroturf');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should flag excessive promotional language', () => {
    const result = validateNoUndisclosedAffiliationClaims({
      body: "This is a game changer! Best thing I've ever used! You won't regret it! Act now!",
    });
    expect(result.flags).toContain('promotional_language');
    expect(result.valid).toBe(false);
  });

  it('should pass authentic content', () => {
    const result = validateNoUndisclosedAffiliationClaims({
      body: 'I found this approach helpful for my project. Here is what worked for me.',
    });
    expect(result.valid).toBe(true);
  });
});

describe('Disclosure Presence Validator', () => {
  it('should pass when disclosure is present and required', () => {
    const result = validateDisclosurePresent(
      { body: 'Disclosure: I work at TestCorp. Here is my review of the product...' },
      true,
      'TestCorp'
    );
    expect(result.valid).toBe(true);
  });

  it('should fail when disclosure is missing but required', () => {
    const result = validateDisclosurePresent(
      { body: 'TestCorp has a great product that I use daily.' },
      true,
      'TestCorp'
    );
    expect(result.valid).toBe(false);
    expect(result.flags).toContain('missing_disclosure');
  });

  it('should pass when disclosure is not required', () => {
    const result = validateDisclosurePresent(
      { body: 'Here is a helpful guide about React hooks.' },
      false,
      'TestCorp'
    );
    expect(result.valid).toBe(true);
  });

  it('should detect various disclosure patterns', () => {
    const patterns = [
      'I work for TestCorp...',
      "I'm affiliated with TestCorp...",
      'Full transparency: TestCorp employee here...',
      'I should mention I work at TestCorp...',
    ];

    for (const body of patterns) {
      const result = validateDisclosurePresent({ body }, true, 'TestCorp');
      expect(result.valid).toBe(true);
    }
  });

  it('should handle case insensitivity', () => {
    const result = validateDisclosurePresent(
      { body: 'DISCLOSURE: I WORK AT testcorp' },
      true,
      'TestCorp'
    );
    expect(result.valid).toBe(true);
  });
});

describe('Combined validateContent', () => {
  it('should aggregate errors from all validators', () => {
    const result = validateContent(
      {
        title: 'Upvote if you agree!',
        body: "Check out https://bit.ly/promo! I have no affiliation with TestCorp but this is amazing!",
      },
      {
        disclosureRequired: true,
        companyName: 'TestCorp',
      }
    );

    expect(result.valid).toBe(false);
    expect(result.flags).toContain('vote_manipulation');
    expect(result.flags).toContain('url_shortener');
    expect(result.flags).toContain('fake_neutrality');
  });

  it('should pass clean, compliant content', () => {
    const result = validateContent(
      {
        body:
          'Disclosure: I work at TestCorp.\n\n' +
          'Here is how I approached solving the state management problem. ' +
          'You can check out the React docs at https://react.dev for more info.',
      },
      {
        disclosureRequired: true,
        companyName: 'TestCorp',
        allowedPostTypes: ['text', 'link'],
      }
    );

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should use strict mode when specified', () => {
    const normalResult = validateContent(
      { body: 'Check out https://bit.ly/test' },
      { strictMode: false }
    );

    const strictResult = validateContent(
      { body: 'Check out https://bit.ly/test' },
      { strictMode: true }
    );

    // Both should flag the shortener, but strict mode should add error
    expect(normalResult.flags).toContain('url_shortener');
    expect(strictResult.flags).toContain('url_shortener');
  });
});

describe('hasCriticalFlags', () => {
  it('should return true for critical flags', () => {
    expect(hasCriticalFlags(['vote_manipulation'])).toBe(true);
    expect(hasCriticalFlags(['coordinated_voting'])).toBe(true);
    expect(hasCriticalFlags(['fake_neutrality'])).toBe(true);
    expect(hasCriticalFlags(['spam_domain'])).toBe(true);
    expect(hasCriticalFlags(['missing_disclosure'])).toBe(true);
  });

  it('should return false for non-critical flags', () => {
    expect(hasCriticalFlags(['contains_links'])).toBe(false);
    expect(hasCriticalFlags(['promotional_language'])).toBe(false);
    expect(hasCriticalFlags(['many_links'])).toBe(false);
  });

  it('should return true if any flag is critical', () => {
    expect(hasCriticalFlags(['contains_links', 'vote_manipulation', 'many_links'])).toBe(true);
  });

  it('should return false for empty array', () => {
    expect(hasCriticalFlags([])).toBe(false);
  });
});
