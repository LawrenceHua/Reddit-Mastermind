import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const RequestSchema = z.object({
  company_name: z.string(),
  company_description: z.string(),
  industry: z.string(),
  target_audience: z.string(),
  num_subreddits: z.number().min(1).max(10).default(5),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface SubredditSuggestion {
  name: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  max_posts_per_week: number;
  rules_summary: string;
  reasoning: string;
  subscriber_estimate: string;
  verified: boolean;
}

async function verifySubreddit(name: string): Promise<{
  exists: boolean;
  subscribers?: number;
  description?: string;
  over18?: boolean;
}> {
  try {
    // Remove r/ prefix if present
    const cleanName = name.replace(/^r\//, '');
    
    const response = await fetch(
      `https://www.reddit.com/r/${cleanName}/about.json`,
      {
        headers: {
          'User-Agent': 'RedditOpsBot/1.0',
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      return { exists: false };
    }

    const data = await response.json();
    const subreddit = data.data;

    return {
      exists: true,
      subscribers: subreddit.subscribers,
      description: subreddit.public_description || subreddit.description,
      over18: subreddit.over18,
    };
  } catch {
    return { exists: false };
  }
}

async function suggestSubredditsWithGPT(input: z.infer<typeof RequestSchema>): Promise<SubredditSuggestion[]> {
  const prompt = `Suggest ${input.num_subreddits + 5} real Reddit subreddits for a company's content marketing strategy. Suggest more than needed so we can verify which ones exist.

COMPANY: ${input.company_name}
DESCRIPTION: ${input.company_description}
INDUSTRY: ${input.industry}
TARGET AUDIENCE: ${input.target_audience}

Suggest subreddits that:
1. Are REAL, active subreddits (not made up)
2. Have relevant audiences who would genuinely benefit from the company's content
3. Have a mix of risk levels (some strict, some lenient about promotional content)
4. Range from large communities to smaller niche ones
5. Allow text posts (most important for content marketing)

For each subreddit, provide:
- name: The subreddit name with r/ prefix (e.g., "r/startups")
- description: Brief description of the community
- risk_level: "low" (lenient moderation), "medium" (standard rules), or "high" (strict anti-promotion)
- max_posts_per_week: Recommended maximum posts (1-3)
- rules_summary: Key rules to be aware of
- reasoning: Why this subreddit is a good fit
- subscriber_estimate: Rough subscriber count estimate (e.g., "500K", "50K", "10K")

Focus on subreddits that have been active for years and are well-established.

Respond with ONLY valid JSON array:`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a Reddit expert who knows which subreddits exist and their rules. Only suggest REAL subreddits that actually exist. Always respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

  // Handle both array and object with subreddits key
  const subreddits = Array.isArray(result) ? result : result.subreddits || [];

  return subreddits.map((s: any) => ({
    name: s.name?.startsWith('r/') ? s.name : `r/${s.name}`,
    description: s.description || '',
    risk_level: ['low', 'medium', 'high'].includes(s.risk_level) ? s.risk_level : 'medium',
    max_posts_per_week: Math.min(Math.max(s.max_posts_per_week || 1, 1), 3),
    rules_summary: s.rules_summary || '',
    reasoning: s.reasoning || '',
    subscriber_estimate: s.subscriber_estimate || 'Unknown',
    verified: false,
  }));
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Parse request
    const body = await request.json();
    const input = RequestSchema.parse(body);

    // Get GPT suggestions
    const suggestions = await suggestSubredditsWithGPT(input);

    // Verify each subreddit against Reddit API (in parallel with rate limiting)
    const verified: SubredditSuggestion[] = [];
    
    for (const suggestion of suggestions) {
      if (verified.length >= input.num_subreddits) break;

      const verification = await verifySubreddit(suggestion.name);
      
      if (verification.exists && !verification.over18) {
        verified.push({
          ...suggestion,
          verified: true,
          subscriber_estimate: verification.subscribers 
            ? formatSubscribers(verification.subscribers) 
            : suggestion.subscriber_estimate,
          description: verification.description || suggestion.description,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // If we couldn't verify enough, include some unverified suggestions
    if (verified.length < input.num_subreddits) {
      const remaining = suggestions
        .filter(s => !verified.some(v => v.name === s.name))
        .slice(0, input.num_subreddits - verified.length);
      
      verified.push(...remaining);
    }

    return NextResponse.json({
      success: true,
      data: { subreddits: verified },
    });
  } catch (error) {
    console.error('Error suggesting subreddits:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatSubscribers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

