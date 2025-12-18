import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const RequestSchema = z.object({
  company_name: z.string(),
  company_description: z.string(),
  industry: z.string(),
  target_audience: z.string(),
  key_benefits: z.array(z.string()).optional(),
  subreddits: z.array(z.string()).optional(),
  num_topics: z.number().min(1).max(20).default(10),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface TopicSuggestion {
  type: 'target_query' | 'pain_point' | 'competitor' | 'faq';
  value: string;
  tags: string[];
  reasoning: string;
  priority: number;
}

async function generateTopics(input: z.infer<typeof RequestSchema>): Promise<TopicSuggestion[]> {
  const prompt = `Generate ${input.num_topics} topic seeds for a Reddit content marketing strategy.

COMPANY: ${input.company_name}
DESCRIPTION: ${input.company_description}
INDUSTRY: ${input.industry}
TARGET AUDIENCE: ${input.target_audience}
KEY BENEFITS: ${input.key_benefits?.join(', ') || 'Not specified'}
TARGET SUBREDDITS: ${input.subreddits?.join(', ') || 'General Reddit'}

Generate a diverse mix of topic seeds across these categories:

1. target_query: Search queries people might use to find solutions (e.g., "best project management tool for startups")
2. pain_point: Common frustrations your target audience has that the product solves (e.g., "struggling with team communication")
3. competitor: Comparisons or alternative discussions (e.g., "Slack alternatives for small teams")
4. faq: Frequently asked questions in the industry (e.g., "how to improve remote team productivity")

For each topic, provide:
- type: One of "target_query", "pain_point", "competitor", "faq"
- value: The actual topic/query text (make it sound natural, like a real Reddit user would ask)
- tags: Array of 2-4 relevant topic tags
- reasoning: Why this topic is valuable for content marketing
- priority: 1-5 (5 being highest priority based on likely engagement)

Aim for a good mix: ~30% target_query, ~30% pain_point, ~20% competitor, ~20% faq

Make the topics:
1. Specific and searchable
2. Natural-sounding (not marketing-speak)
3. Likely to generate genuine discussion
4. Relevant to the target subreddits

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
          content: 'You are a content strategist expert at Reddit marketing. Generate topic seeds that would work well for authentic Reddit engagement. Always respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

  // Handle both array and object with topics key
  const topics = Array.isArray(result) ? result : result.topics || result.topic_seeds || [];

  return topics.map((t: any) => ({
    type: ['target_query', 'pain_point', 'competitor', 'faq'].includes(t.type) 
      ? t.type 
      : 'target_query',
    value: t.value || '',
    tags: t.tags || [],
    reasoning: t.reasoning || '',
    priority: Math.min(Math.max(t.priority || 3, 1), 5),
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

    // Generate topics
    const topics = await generateTopics(input);

    // Sort by priority
    topics.sort((a, b) => b.priority - a.priority);

    return NextResponse.json({
      success: true,
      data: { topics },
    });
  } catch (error) {
    console.error('Error generating topics:', error);

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

