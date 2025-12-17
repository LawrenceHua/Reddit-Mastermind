import { z } from 'zod';
import type { LLMClient, LLMConfig } from './types';
import { LLMError, ValidationError, RateLimitError } from './types';

const DEFAULT_CONFIG: LLMConfig = {
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
  maxRetries: 3,
  retryDelayMs: 1000,
};

function generateTraceId(): string {
  return `llm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpenAIClient(apiKey: string): LLMClient {
  async function generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: Partial<LLMConfig>
  ): Promise<{ data: T; traceId: string }> {
    const config = { ...DEFAULT_CONFIG, ...options };
    const traceId = generateTraceId();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-Request-ID': traceId,
          },
          body: JSON.stringify({
            model: config.model,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            messages: [
              {
                role: 'system',
                content: `You are a helpful assistant that always responds with valid JSON matching the requested schema. Never include markdown code blocks or any text outside the JSON object.`,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();

          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') ?? '60');
            throw new RateLimitError(`Rate limit exceeded: ${errorBody}`, traceId, retryAfter);
          }

          if (response.status >= 500) {
            throw new LLMError(`OpenAI server error: ${errorBody}`, 'SERVER_ERROR', traceId, true);
          }

          throw new LLMError(`OpenAI API error: ${errorBody}`, 'API_ERROR', traceId, false);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new LLMError('No content in response', 'EMPTY_RESPONSE', traceId, true);
        }

        // Parse JSON from response
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new LLMError(
            `Invalid JSON in response: ${content.substring(0, 200)}`,
            'INVALID_JSON',
            traceId,
            true
          );
        }

        // Validate against schema
        const result = schema.safeParse(parsed);
        if (!result.success) {
          throw new ValidationError(
            `Response does not match schema: ${result.error.message}`,
            result.error,
            traceId
          );
        }

        return { data: result.data, traceId };
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-retryable errors
        if (error instanceof LLMError && !error.retryable) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = config.retryDelayMs * Math.pow(2, attempt);

        if (error instanceof RateLimitError && error.retryAfter) {
          await sleep(error.retryAfter * 1000);
        } else {
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new LLMError('Max retries exceeded', 'MAX_RETRIES', traceId, false);
  }

  return { generateStructured };
}

// Prompt builders
export function buildPostGenerationPrompt(context: {
  companyProfile: { name: string; description: string; website?: string };
  persona: { name: string; bio: string | null; tone: string | null; disclosureRequired: boolean };
  subreddit: { name: string; rulesText: string | null };
  topicSeed: { text: string; seedType: string };
}): string {
  const disclosureInstruction = context.persona.disclosureRequired
    ? `IMPORTANT: This persona requires disclosure. Include a natural disclosure in the post indicating affiliation with ${context.companyProfile.name}. Set disclosure_used to the disclosure text you included.`
    : 'No disclosure is required for this persona. Set disclosure_used to null.';

  return `Generate a Reddit post for r/${context.subreddit.name}.

COMPANY CONTEXT:
- Name: ${context.companyProfile.name}
- Description: ${context.companyProfile.description}
${context.companyProfile.website ? `- Website: ${context.companyProfile.website}` : ''}

PERSONA:
- Name: ${context.persona.name}
${context.persona.bio ? `- Bio: ${context.persona.bio}` : ''}
${context.persona.tone ? `- Tone: ${context.persona.tone}` : ''}

SUBREDDIT RULES:
${context.subreddit.rulesText ?? 'No specific rules provided - follow standard Reddit etiquette.'}

TOPIC/ANGLE:
Type: ${context.topicSeed.seedType}
Content: ${context.topicSeed.text}

${disclosureInstruction}

REQUIREMENTS:
1. The post must be VALUE-FIRST - genuinely helpful to the subreddit community
2. Do NOT include obvious promotional language or CTAs
3. Write naturally as a real person would
4. The title should be engaging but not clickbait
5. Keep the tone consistent with the persona
6. If mentioning the company/product, it should feel natural and contextual
7. Flag any potential risks in the risk_flags array (e.g., "contains_link", "promotional_mention", "controversial_topic")

RESPOND WITH VALID JSON matching this exact structure:
{
  "post": {
    "title": "string - the post title",
    "body_md": "string - the post body in markdown",
    "topic_cluster_key": "string - a unique key identifying this topic (e.g., 'pricing-strategy-saas')",
    "target_query_tags": ["array", "of", "relevant", "search", "terms"],
    "risk_flags": ["array", "of", "risk", "flags"],
    "disclosure_used": "string or null - the disclosure text if used"
  },
  "op_followup_comment": {
    "body_md": "string - optional follow-up comment from OP to add context"
  } OR null
}`;
}

export function buildQualityScoringPrompt(
  post: { title: string; body_md: string },
  subredditName: string,
  subredditRules: string | null
): string {
  return `Score this Reddit post for r/${subredditName} on a scale of 0-10 for each dimension.

POST TITLE: ${post.title}

POST BODY:
${post.body_md}

SUBREDDIT RULES:
${subredditRules ?? 'No specific rules provided.'}

SCORING DIMENSIONS:
1. subreddit_fit: How well does this post fit the subreddit's culture and rules?
2. helpfulness: How useful/valuable is this content to readers?
3. authenticity: Does this sound like a genuine person sharing knowledge, not marketing?
4. compliance_safety: Is this free of manipulation, spam, or policy violations?
5. brand_subtlety: If there's any brand mention, is it natural and value-first?
6. overall: Overall quality score

RESPOND WITH VALID JSON:
{
  "subreddit_fit": 0-10,
  "helpfulness": 0-10,
  "authenticity": 0-10,
  "compliance_safety": 0-10,
  "brand_subtlety": 0-10,
  "overall": 0-10,
  "reasoning": "Brief explanation of the scores"
}`;
}
