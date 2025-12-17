import {
  createOpenAIClient,
  buildPostGenerationPrompt,
  buildQualityScoringPrompt,
  PostCandidateSchema,
  QualityScoreSchema,
  type LLMClient,
  type PostCandidate,
  type QualityScore,
} from '@/lib/llm';
import { validateContent } from '@/lib/validators';
import type {
  GenerationInput,
  ScoredCandidate,
  SlotGenerationResult,
  GenerationConfig,
} from './types';
import { DEFAULT_GENERATION_CONFIG } from './types';

/**
 * Generate a single candidate for a slot
 */
async function generateCandidate(
  client: LLMClient,
  input: GenerationInput,
  config: GenerationConfig
): Promise<PostCandidate> {
  const prompt = buildPostGenerationPrompt({
    companyProfile: input.companyProfile,
    persona: {
      name: input.persona.name,
      bio: input.persona.bio,
      tone: input.persona.tone,
      disclosureRequired: input.persona.disclosureRequired,
    },
    subreddit: {
      name: input.subreddit.name,
      rulesText: input.subreddit.rulesText,
    },
    topicSeed: {
      text: input.topicSeed.text,
      seedType: input.topicSeed.seedType,
    },
  });

  const { data } = await client.generateStructured(prompt, PostCandidateSchema, {
    model: config.model,
    temperature: config.temperature,
  });

  return data;
}

/**
 * Score a candidate using LLM
 */
async function scoreCandidate(
  client: LLMClient,
  candidate: PostCandidate,
  subredditName: string,
  subredditRules: string | null,
  config: GenerationConfig
): Promise<QualityScore> {
  const prompt = buildQualityScoringPrompt(
    {
      title: candidate.post.title,
      body_md: candidate.post.body_md,
    },
    subredditName,
    subredditRules
  );

  const { data } = await client.generateStructured(prompt, QualityScoreSchema, {
    model: config.model,
    temperature: 0.3, // Lower temperature for more consistent scoring
  });

  return data;
}

/**
 * Validate a candidate and return scored result
 */
function validateAndWrapCandidate(
  candidate: PostCandidate,
  score: QualityScore,
  input: GenerationInput
): ScoredCandidate {
  const validationResult = validateContent(
    {
      title: candidate.post.title,
      body: candidate.post.body_md,
    },
    {
      disclosureRequired: input.persona.disclosureRequired,
      companyName: input.companyProfile.name,
      allowedPostTypes: input.subreddit.allowedPostTypes,
    }
  );

  return {
    candidate,
    score,
    validationFlags: [...candidate.post.risk_flags, ...validationResult.flags],
    validationErrors: validationResult.errors,
    validationWarnings: validationResult.warnings,
  };
}

/**
 * Select the best candidate from scored candidates
 */
function selectBestCandidate(
  candidates: ScoredCandidate[],
  minQualityScore: number
): ScoredCandidate | null {
  // Filter out candidates with critical validation errors
  const validCandidates = candidates.filter((c) => c.validationErrors.length === 0);

  if (validCandidates.length === 0) {
    // If all have errors, return the one with highest score anyway (for review)
    return candidates.reduce((best, current) =>
      current.score.overall > best.score.overall ? current : best
    );
  }

  // Filter by minimum quality score
  const qualityCandidates = validCandidates.filter((c) => c.score.overall >= minQualityScore);

  if (qualityCandidates.length === 0) {
    // Return best valid candidate even if below threshold
    return validCandidates.reduce((best, current) =>
      current.score.overall > best.score.overall ? current : best
    );
  }

  // Return the highest scoring quality candidate
  return qualityCandidates.reduce((best, current) =>
    current.score.overall > best.score.overall ? current : best
  );
}

/**
 * Generate candidates for a single slot
 */
export async function generateCandidatesForSlot(
  input: GenerationInput,
  apiKey: string,
  config: GenerationConfig = DEFAULT_GENERATION_CONFIG
): Promise<SlotGenerationResult> {
  const client = createOpenAIClient(apiKey);
  const candidates: ScoredCandidate[] = [];
  const errors: string[] = [];

  for (let i = 0; i < config.candidatesPerSlot; i++) {
    try {
      // Generate candidate
      const candidate = await generateCandidate(client, input, config);

      // Score candidate
      const score = await scoreCandidate(
        client,
        candidate,
        input.subreddit.name,
        input.subreddit.rulesText,
        config
      );

      // Validate and wrap
      const scored = validateAndWrapCandidate(candidate, score, input);
      candidates.push(scored);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Candidate ${i + 1} generation failed: ${message}`);
    }
  }

  // Select best candidate
  const selectedCandidate =
    candidates.length > 0 ? selectBestCandidate(candidates, config.minQualityScore) : null;

  return {
    slotIndex: input.slot.index,
    candidates,
    selectedCandidate,
    errors,
  };
}

/**
 * Heuristic scoring (fast, no LLM call)
 */
export function calculateHeuristicScore(candidate: PostCandidate): Partial<QualityScore> {
  const post = candidate.post;
  let score = 7.0; // Base score

  // Length checks
  if (post.body_md.length < 100) score -= 2;
  else if (post.body_md.length > 500) score += 0.5;
  else if (post.body_md.length > 2000) score -= 0.5; // Too long

  // Title checks
  if (post.title.length < 20) score -= 1;
  if (post.title.length > 200) score -= 0.5;
  if (/[A-Z]{3,}/.test(post.title)) score -= 1; // ALL CAPS

  // Risk flags penalty
  score -= post.risk_flags.length * 0.5;

  // Has follow-up comment (engagement opportunity)
  if (candidate.op_followup_comment) score += 0.5;

  // Clamp score
  score = Math.max(0, Math.min(10, score));

  return {
    overall: Math.round(score * 100) / 100,
    reasoning: 'Heuristic scoring based on content length, format, and flags',
  };
}
