import { z } from 'zod';

// Generated content schema
export const PostCandidateSchema = z.object({
  post: z.object({
    title: z.string().min(1).max(300),
    body_md: z.string().min(10).max(40000),
    topic_cluster_key: z.string(),
    target_query_tags: z.array(z.string()),
    risk_flags: z.array(z.string()),
    disclosure_used: z.string().nullable(),
  }),
  op_followup_comment: z
    .object({
      body_md: z.string().min(1).max(10000),
    })
    .nullable(),
});

export type PostCandidate = z.infer<typeof PostCandidateSchema>;

// Quality scoring schema
export const QualityScoreSchema = z.object({
  subreddit_fit: z.number().min(0).max(10),
  helpfulness: z.number().min(0).max(10),
  authenticity: z.number().min(0).max(10),
  compliance_safety: z.number().min(0).max(10),
  brand_subtlety: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  reasoning: z.string(),
});

export type QualityScore = z.infer<typeof QualityScoreSchema>;

// LLM configuration
export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  maxRetries: number;
  retryDelayMs: number;
}

// Generation context
export interface GenerationContext {
  companyProfile: {
    name: string;
    description: string;
    website?: string;
    industry?: string;
  };
  persona: {
    name: string;
    bio: string | null;
    tone: string | null;
    expertiseTags: string[];
    disclosureRequired: boolean;
    writingRules: Record<string, unknown>;
  };
  subreddit: {
    name: string;
    rulesText: string | null;
    allowedPostTypes: string[];
  };
  topicSeeds: Array<{
    text: string;
    seedType: string;
    tags: string[];
  }>;
  brandVoice: Record<string, unknown>;
}

// LLM adapter interface
export interface LLMClient {
  generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: Partial<LLMConfig>
  ): Promise<{ data: T; traceId: string }>;
}

// Error types
export class LLMError extends Error {
  constructor(
    message: string,
    public code: string,
    public traceId?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class ValidationError extends LLMError {
  constructor(
    message: string,
    public zodErrors: z.ZodError,
    traceId?: string
  ) {
    super(message, 'VALIDATION_ERROR', traceId, true);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends LLMError {
  constructor(
    message: string,
    traceId?: string,
    public retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT', traceId, true);
    this.name = 'RateLimitError';
  }
}
