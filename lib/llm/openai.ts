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

// Models that support JSON Schema structured outputs
const JSON_SCHEMA_SUPPORTED_MODELS = [
  'gpt-4o',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-11-20',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
];

function generateTraceId(): string {
  return `llm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert a Zod schema to JSON Schema format for OpenAI's structured outputs.
 * This is a simplified converter that handles common Zod types.
 */
function zodToJsonSchema(schema: z.ZodTypeAny, definitions: Map<string, object> = new Map()): object {
  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodTypeAny, definitions);
      // Check if the field is optional
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    };
  }

  // Handle ZodArray
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element, definitions),
    };
  }

  // Handle ZodString
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    const checks = schema._def.checks;
    for (const check of checks) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
    }
    return result;
  }

  // Handle ZodNumber
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    const checks = schema._def.checks;
    for (const check of checks) {
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
      if (check.kind === 'int') result.type = 'integer';
    }
    return result;
  }

  // Handle ZodBoolean
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  // Handle ZodNullable
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap(), definitions);
    return {
      anyOf: [inner, { type: 'null' }],
    };
  }

  // Handle ZodOptional
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap(), definitions);
  }

  // Handle ZodEnum
  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema.options,
    };
  }

  // Handle ZodLiteral
  if (schema instanceof z.ZodLiteral) {
    const value = schema.value;
    if (typeof value === 'string') {
      return { type: 'string', enum: [value] };
    }
    if (typeof value === 'number') {
      return { type: 'number', enum: [value] };
    }
    if (typeof value === 'boolean') {
      return { type: 'boolean', enum: [value] };
    }
    return { const: value };
  }

  // Handle ZodUnion
  if (schema instanceof z.ZodUnion) {
    const options = schema.options.map((opt: z.ZodTypeAny) => zodToJsonSchema(opt, definitions));
    return { anyOf: options };
  }

  // Handle ZodRecord
  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema.valueSchema, definitions),
    };
  }

  // Handle ZodNull
  if (schema instanceof z.ZodNull) {
    return { type: 'null' };
  }

  // Fallback for unknown types
  return { type: 'object' };
}

/**
 * Wrap a JSON Schema for use with OpenAI's structured outputs.
 */
function createOpenAIJsonSchema(name: string, schema: z.ZodTypeAny): object {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      schema: zodToJsonSchema(schema),
      strict: true,
    },
  };
}

/**
 * Check if a model supports JSON Schema structured outputs.
 */
function supportsJsonSchema(model: string): boolean {
  return JSON_SCHEMA_SUPPORTED_MODELS.some(
    (supported) => model === supported || model.startsWith(supported)
  );
}

export interface OpenAIClientOptions {
  /**
   * Force use of json_object mode even if model supports JSON Schema.
   * Useful for fallback or debugging.
   */
  forceJsonObject?: boolean;
  /**
   * Timeout in milliseconds for API requests.
   */
  timeoutMs?: number;
}

export function createOpenAIClient(apiKey: string, clientOptions?: OpenAIClientOptions): LLMClient {
  const { forceJsonObject = false, timeoutMs = 120000 } = clientOptions ?? {};

  async function generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: Partial<LLMConfig> & { schemaName?: string }
  ): Promise<{ data: T; traceId: string }> {
    const config = { ...DEFAULT_CONFIG, ...options };
    const traceId = generateTraceId();
    const schemaName = options?.schemaName ?? 'response';

    // Determine whether to use JSON Schema or json_object mode
    const useJsonSchema = !forceJsonObject && supportsJsonSchema(config.model);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Build response_format based on mode
        const responseFormat = useJsonSchema
          ? createOpenAIJsonSchema(schemaName, schema as z.ZodTypeAny)
          : { type: 'json_object' };

        // System prompt is simpler with JSON Schema mode since OpenAI handles structure
        const systemContent = useJsonSchema
          ? 'You are a helpful assistant. Respond with the requested information.'
          : 'You are a helpful assistant that always responds with valid JSON matching the requested schema. Never include markdown code blocks or any text outside the JSON object.';

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
                content: systemContent,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            response_format: responseFormat,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();

          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') ?? '60');
            throw new RateLimitError(`Rate limit exceeded: ${errorBody}`, traceId, retryAfter);
          }

          if (response.status >= 500) {
            throw new LLMError(`OpenAI server error: ${errorBody}`, 'SERVER_ERROR', traceId, true);
          }

          // If JSON Schema mode fails due to unsupported model, fall back to json_object
          if (
            useJsonSchema &&
            response.status === 400 &&
            errorBody.includes('json_schema')
          ) {
            throw new LLMError(
              'JSON Schema mode not supported, will retry with json_object',
              'FALLBACK_JSON_OBJECT',
              traceId,
              true
            );
          }

          throw new LLMError(`OpenAI API error: ${errorBody}`, 'API_ERROR', traceId, false);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        const refusal = data.choices?.[0]?.message?.refusal;

        // Handle refusals (safety filtering)
        if (refusal) {
          throw new LLMError(`Model refused request: ${refusal}`, 'REFUSAL', traceId, false);
        }

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

        // Validate against Zod schema (belt and suspenders with JSON Schema mode)
        const result = schema.safeParse(parsed);
        if (!result.success) {
          throw new ValidationError(
            `Response does not match schema: ${result.error.message}`,
            result.error,
            traceId
          );
        }

        // Log usage info for observability
        const usage = data.usage;
        if (usage) {
          console.log(
            `[LLM] ${traceId} | model=${config.model} | mode=${useJsonSchema ? 'json_schema' : 'json_object'} | prompt_tokens=${usage.prompt_tokens} | completion_tokens=${usage.completion_tokens}`
          );
        }

        return { data: result.data, traceId };
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error as Error;

        // Handle abort (timeout)
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new LLMError('Request timed out', 'TIMEOUT', traceId, true);
        }

        // Don't retry non-retryable errors
        if (error instanceof LLMError && !error.retryable) {
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay = config.retryDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * 0.2 * baseDelay; // Add up to 20% jitter
        const delay = baseDelay + jitter;

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

/**
 * Create an OpenAI client that always uses json_object mode (fallback implementation).
 * Useful when JSON Schema mode is having issues or for compatibility with older models.
 */
export function createOpenAIClientJsonObject(apiKey: string): LLMClient {
  return createOpenAIClient(apiKey, { forceJsonObject: true });
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
