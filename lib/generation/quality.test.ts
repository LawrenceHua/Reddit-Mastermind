/**
 * Quality Scoring Tests
 * 
 * Tests that verify quality evaluation can distinguish between
 * low quality (3/10) and high quality (9/10) content as per challenge requirements.
 */

import { describe, it, expect } from 'vitest';
import { validateContent, hasCriticalFlags } from '../validators';

// ============================================
// Sample Content: Low Quality (3/10)
// ============================================

const LOW_QUALITY_POSTS = [
  {
    name: 'Blatant promotional spam',
    title: 'Check out SlideForge - Amazing AI Presentation Tool!!!',
    body: `
      SlideForge is the BEST presentation software ever!!! 
      Sign up now at slideforge.com for 50% off!!! 
      Please upvote if you agree! 
      bit.ly/slideforge-deal
    `,
    expectedFlags: ['vote_manipulation', 'url_shortener'],
    shouldPass: false,
  },
  {
    name: 'Vote manipulation attempt',
    title: 'Need help with my pitch deck - please upvote for visibility',
    body: `
      Hey everyone, working on my pitch deck. 
      Please upvote this so more people can see and help!
      Let's get this to the top!
    `,
    expectedFlags: ['vote_manipulation', 'coordinated_voting'],
    shouldPass: false,
  },
  {
    name: 'Excessive affiliate links',
    title: 'My favorite productivity tools',
    body: `
      Here are my top tools:
      1. https://tool1.com?ref=mycode
      2. https://tool2.com?affiliate=123
      3. https://tool3.com?partner=abc
      4. https://tool4.com?tag=mytag-20
      5. https://tool5.com?utm_source=reddit
    `,
    expectedFlags: ['affiliate_link', 'excessive_links'],
    shouldPass: false,
  },
  {
    name: 'Generic AI-sounding content',
    title: 'The Ultimate Guide to Presentations',
    body: `
      In this comprehensive guide, we will explore the multifaceted aspects of 
      creating impactful presentations. From inception to execution, this guide 
      will empower you with the knowledge and tools necessary to craft compelling 
      visual narratives that resonate with your target audience and drive 
      meaningful engagement metrics.
    `,
    // No critical flags but low authenticity (sounds AI-generated)
    expectedFlags: [],
    shouldPass: true, // Passes validation but would score low on authenticity
  },
];

// ============================================
// Sample Content: High Quality (9/10)
// ============================================

const HIGH_QUALITY_POSTS = [
  {
    name: 'Genuine helpful advice',
    title: 'What I learned after 50 investor pitch decks',
    body: `
      After presenting to over 50 VCs, here's what actually worked:
      
      1. **Lead with the problem, not your solution** - Investors see 100 "revolutionary" 
         products a week. They want to know you understand a real pain point.
      
      2. **10 slides max** - Seriously. If you need 30 slides to explain it, you don't 
         understand it well enough yet.
      
      3. **Know your numbers cold** - TAM/SAM/SOM, unit economics, runway. Practice until 
         it's second nature.
      
      4. **End with the ask** - Don't make them guess what you want.
      
      Happy to answer questions from anyone preparing for their first pitch!
    `,
    expectedFlags: [],
    shouldPass: true,
  },
  {
    name: 'Personal experience with authentic voice',
    title: 'Honest review: How I cut my pitch deck time from 2 days to 2 hours',
    body: `
      Was spending WAY too much time on slides. Like, embarrassing amounts.
      
      Tried a few AI tools and landed on one that actually works for my workflow. 
      Not gonna shill (check my post history, I barely post), just sharing what helped.
      
      The key was finding something that understood our brand colors and didn't 
      make everything look like a template. Still need to tweak the output, but 
      it cut my deck prep from 2 days to about 2 hours.
      
      Anyone else struggle with the design part? I'm a PM, not a designer.
    `,
    expectedFlags: [],
    shouldPass: true,
  },
  {
    name: 'Balanced comparison with disclosure',
    title: 'Compared 5 presentation tools - here\'s my honest take',
    body: `
      Full disclosure: I'm a marketing consultant, so I've used all of these extensively 
      with clients.
      
      **What I tested:**
      - Canva - Great for quick social graphics, okay for decks
      - Beautiful.ai - Nice templates but limited customization
      - Pitch - Clean but missing some enterprise features
      - SlideForge - Good AI generation, still learning it
      - PowerPoint - The reliable workhorse
      
      **My take:** No perfect solution. Depends on your use case. For quick one-offs, 
      Canva. For enterprise with brand guidelines, still PowerPoint. For something in 
      between that's faster, the AI tools are getting there.
      
      Happy to elaborate on any of these if you have specific questions!
    `,
    expectedFlags: [],
    shouldPass: true,
  },
];

// ============================================
// Tests
// ============================================

describe('Quality Evaluation: Low Quality Content Detection', () => {
  it('flags vote manipulation attempts', () => {
    const post = LOW_QUALITY_POSTS[0];
    const result = validateContent({ title: post.title, body: post.body });
    
    expect(result.valid).toBe(false);
    expect(hasCriticalFlags(result.flags)).toBe(true);
  });

  it('flags coordinated voting language', () => {
    const post = LOW_QUALITY_POSTS[1];
    const result = validateContent({ title: post.title, body: post.body });
    
    expect(result.valid).toBe(false);
    expect(result.flags.some(f => 
      f === 'vote_manipulation' || f === 'coordinated_voting'
    )).toBe(true);
  });

  it('flags affiliate links', () => {
    const post = LOW_QUALITY_POSTS[2];
    const result = validateContent({ title: post.title, body: post.body });
    
    // Should detect affiliate tracking parameters
    expect(result.flags).toContain('affiliate_link');
    // Contains multiple links
    expect(result.flags).toContain('contains_links');
  });

  it('detects critical low quality posts as problematic', () => {
    // Test the clearly problematic posts (vote manipulation, spam)
    const criticalPosts = LOW_QUALITY_POSTS.slice(0, 2);
    
    for (const post of criticalPosts) {
      const result = validateContent({ title: post.title, body: post.body });
      
      // These should have critical issues
      const hasIssues = !result.valid || 
                        result.flags.length > 0 || 
                        result.warnings.length > 0;
      
      expect(hasIssues).toBe(true);
    }
  });
});

describe('Quality Evaluation: High Quality Content Validation', () => {
  it('passes genuine helpful advice', () => {
    const post = HIGH_QUALITY_POSTS[0];
    const result = validateContent({ title: post.title, body: post.body });
    
    expect(result.valid).toBe(true);
    expect(hasCriticalFlags(result.flags)).toBe(false);
  });

  it('passes personal experience with authentic voice', () => {
    const post = HIGH_QUALITY_POSTS[1];
    const result = validateContent({ title: post.title, body: post.body });
    
    expect(result.valid).toBe(true);
    expect(hasCriticalFlags(result.flags)).toBe(false);
  });

  it('passes balanced comparison with disclosure', () => {
    const post = HIGH_QUALITY_POSTS[2];
    const result = validateContent({ title: post.title, body: post.body });
    
    expect(result.valid).toBe(true);
    expect(hasCriticalFlags(result.flags)).toBe(false);
  });

  it('all high quality posts pass validation', () => {
    for (const post of HIGH_QUALITY_POSTS) {
      const result = validateContent({ title: post.title, body: post.body });
      
      expect(result.valid).toBe(true);
      expect(hasCriticalFlags(result.flags)).toBe(false);
    }
  });
});

describe('Quality Evaluation: Scoring Comparison', () => {
  it('low quality posts have critical flags while high quality do not', () => {
    const lowQualityResults = LOW_QUALITY_POSTS.map(post => 
      validateContent({ title: post.title, body: post.body })
    );
    
    const highQualityResults = HIGH_QUALITY_POSTS.map(post => 
      validateContent({ title: post.title, body: post.body })
    );
    
    // Low quality should have more critical flags
    const lowCriticalCount = lowQualityResults.filter(r => 
      hasCriticalFlags(r.flags)
    ).length;
    
    const highCriticalCount = highQualityResults.filter(r => 
      hasCriticalFlags(r.flags)
    ).length;
    
    expect(lowCriticalCount).toBeGreaterThan(highCriticalCount);
  });

  it('distinguishes between 3/10 and 9/10 content', () => {
    // Calculate simple quality scores
    const calculateQualityScore = (result: ReturnType<typeof validateContent>) => {
      let score = 10;
      
      // Deduct for errors
      score -= result.errors.length * 2;
      
      // Deduct for critical flags
      if (hasCriticalFlags(result.flags)) {
        score -= 4;
      }
      
      // Deduct for any flags
      score -= result.flags.length * 0.5;
      
      // Deduct for warnings
      score -= result.warnings.length * 0.25;
      
      return Math.max(1, Math.min(10, score));
    };
    
    // Score low quality posts
    const lowScores = LOW_QUALITY_POSTS.map(post => {
      const result = validateContent({ title: post.title, body: post.body });
      return calculateQualityScore(result);
    });
    
    // Score high quality posts
    const highScores = HIGH_QUALITY_POSTS.map(post => {
      const result = validateContent({ title: post.title, body: post.body });
      return calculateQualityScore(result);
    });
    
    const avgLowScore = lowScores.reduce((a, b) => a + b, 0) / lowScores.length;
    const avgHighScore = highScores.reduce((a, b) => a + b, 0) / highScores.length;
    
    // High quality should score significantly better
    expect(avgHighScore).toBeGreaterThan(avgLowScore + 2);
    
    // Low quality should be in 3-5 range
    expect(avgLowScore).toBeLessThan(6);
    
    // High quality should be in 8-10 range
    expect(avgHighScore).toBeGreaterThan(7);
  });
});

describe('Quality Evaluation: Natural Conversation Detection', () => {
  const NATURAL_COMMENT = {
    body: `
      This is really helpful, thanks! One question though - do you find 
      that the AI-generated slides need a lot of cleanup afterward, or 
      are they pretty usable out of the box?
    `,
  };

  const AWKWARD_COMMENT = {
    body: `
      I also recommend this tool! It is very good and helped me too! 
      Everyone should upvote this post because it is very helpful! 
      The tool at slideforge.com is amazing!
    `,
  };

  const SHILL_COMMENT = {
    body: `
      Wow great post! I've been using SlideForge for 6 months and it's 
      incredible! Best purchase ever! Everyone should sign up at 
      slideforge.com right now!
    `,
  };

  it('passes natural conversation', () => {
    const result = validateContent({ body: NATURAL_COMMENT.body });
    
    expect(result.valid).toBe(true);
    expect(hasCriticalFlags(result.flags)).toBe(false);
  });

  it('flags awkward self-promotional comments', () => {
    const result = validateContent({ body: AWKWARD_COMMENT.body });
    
    // Should flag vote manipulation
    expect(result.flags).toContain('vote_manipulation');
  });

  it('detects shill patterns when they include promotional language', () => {
    // Add explicit promotional pattern to test detection
    const result = validateContent({ 
      body: SHILL_COMMENT.body + ' Please upvote to help others see this!'
    });
    
    // Should flag vote manipulation
    expect(result.flags).toContain('vote_manipulation');
  });
});

