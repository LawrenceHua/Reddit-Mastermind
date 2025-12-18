import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as cheerio from 'cheerio';
import { z } from 'zod';

const RequestSchema = z.object({
  website_url: z.string().url(),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RedditOpsBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    throw new Error(`Could not fetch website: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function extractTextContent(html: string): {
  title: string;
  description: string;
  headings: string[];
  bodyText: string;
} {
  const $ = cheerio.load(html);

  // Remove scripts, styles, and other non-content elements
  $('script, style, nav, footer, header, aside, iframe, noscript').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim();
  
  const description = 
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    '';

  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) {
      headings.push(text);
    }
  });

  // Get main content text (limit to avoid token overflow)
  const bodyText = $('main, article, .content, #content, body')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);

  return { title, description, headings: headings.slice(0, 10), bodyText };
}

async function analyzeWithGPT(content: {
  title: string;
  description: string;
  headings: string[];
  bodyText: string;
  url: string;
}): Promise<{
  name: string;
  description: string;
  industry: string;
  target_audience: string;
  key_benefits: string[];
  brand_voice: string;
}> {
  const prompt = `Analyze this company website and extract structured information.

WEBSITE URL: ${content.url}
TITLE: ${content.title}
META DESCRIPTION: ${content.description}
HEADINGS: ${content.headings.join(', ')}
CONTENT EXCERPT: ${content.bodyText.slice(0, 3000)}

Based on this website content, provide a JSON response with:
1. name: The company name
2. description: A 2-3 sentence description of what the company does
3. industry: The primary industry (e.g., "SaaS", "E-commerce", "Healthcare Tech", "Marketing Agency")
4. target_audience: Who their ideal customers are
5. key_benefits: Array of 3-5 main value propositions or benefits
6. brand_voice: Describe their brand voice/tone in 2-3 words (e.g., "professional, innovative, friendly")

Respond with ONLY valid JSON, no markdown:`;

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
          content: 'You are a business analyst. Extract company information from website content. Always respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

  return {
    name: result.name || content.title,
    description: result.description || content.description,
    industry: result.industry || 'Technology',
    target_audience: result.target_audience || 'Business professionals',
    key_benefits: result.key_benefits || [],
    brand_voice: result.brand_voice || 'professional',
  };
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
    const { website_url } = RequestSchema.parse(body);

    // Fetch and parse website
    const html = await fetchWebsiteContent(website_url);
    const extracted = extractTextContent(html);

    // Analyze with GPT
    const analysis = await analyzeWithGPT({ ...extracted, url: website_url });

    return NextResponse.json({
      success: true,
      data: {
        website: website_url,
        ...analysis,
      },
    });
  } catch (error) {
    console.error('Error scraping company:', error);

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

