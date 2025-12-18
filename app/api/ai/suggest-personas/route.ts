import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const RequestSchema = z.object({
  company_name: z.string(),
  company_description: z.string(),
  industry: z.string(),
  target_audience: z.string(),
  brand_voice: z.string().optional(),
  num_personas: z.number().min(1).max(5).default(3),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface PersonaSuggestion {
  name: string;
  bio: string;
  tone: string;
  expertise_tags: string[];
  disclosure_required: boolean;
  reasoning: string;
}

async function generatePersonas(input: z.infer<typeof RequestSchema>): Promise<PersonaSuggestion[]> {
  const prompt = `Generate ${input.num_personas} distinct Reddit personas for a company's content marketing strategy.

COMPANY: ${input.company_name}
DESCRIPTION: ${input.company_description}
INDUSTRY: ${input.industry}
TARGET AUDIENCE: ${input.target_audience}
BRAND VOICE: ${input.brand_voice || 'professional'}

Create personas that:
1. Feel like REAL Reddit users, not marketers
2. Have authentic backstories that justify their interest in the topic
3. Have varied tones (some casual, some professional, some enthusiastic)
4. Have different expertise levels and perspectives
5. Would naturally recommend or discuss the company's product/service

For each persona, provide:
- name: A believable first name + last initial (e.g., "Alex C." or "Sarah M.")
- bio: A 2-3 sentence backstory explaining who they are and why they're on Reddit
- tone: Their communication style in 2-3 words (e.g., "casual, helpful", "analytical, detailed")
- expertise_tags: Array of 3-5 topics they're knowledgeable about
- disclosure_required: true if they work for/are affiliated with the company, false if they're a "satisfied customer" type
- reasoning: Brief explanation of how this persona helps the content strategy

Important: At least one persona should require disclosure (an employee/affiliate type), and at least one should be a genuine customer/user type.

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
          content: 'You are an expert at creating authentic Reddit personas for ethical content marketing. Create personas that feel real and would engage naturally. Always respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

  // Handle both array and object with personas key
  const personas = Array.isArray(result) ? result : result.personas || [];
  
  return personas.map((p: any) => ({
    name: p.name || 'Anonymous',
    bio: p.bio || '',
    tone: p.tone || 'casual',
    expertise_tags: p.expertise_tags || [],
    disclosure_required: p.disclosure_required ?? false,
    reasoning: p.reasoning || '',
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

    // Generate personas
    const personas = await generatePersonas(input);

    return NextResponse.json({
      success: true,
      data: { personas },
    });
  } catch (error) {
    console.error('Error generating personas:', error);

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

