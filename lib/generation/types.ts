import type { PostCandidate, QualityScore } from '@/lib/llm';
import type { AssignedSlot, Persona, Subreddit, TopicSeed } from '@/lib/planner';

export interface GenerationInput {
  slot: AssignedSlot;
  subreddit: Subreddit;
  persona: Persona;
  topicSeed: TopicSeed;
  companyProfile: {
    name: string;
    description: string;
    website?: string;
    industry?: string;
  };
  brandVoice: Record<string, unknown>;
}

export interface ScoredCandidate {
  candidate: PostCandidate;
  score: QualityScore;
  validationFlags: string[];
  validationErrors: string[];
  validationWarnings: string[];
}

export interface SlotGenerationResult {
  slotIndex: number;
  candidates: ScoredCandidate[];
  selectedCandidate: ScoredCandidate | null;
  errors: string[];
}

export interface WeekGenerationResult {
  weekId: string;
  projectId: string;
  weekStartDate: Date;
  slots: SlotGenerationResult[];
  totalCandidates: number;
  successfulSlots: number;
  failedSlots: number;
  generationTimeMs: number;
}

export interface GenerationConfig {
  candidatesPerSlot: number;
  minQualityScore: number;
  model: string;
  temperature: number;
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  candidatesPerSlot: 3,
  minQualityScore: 6.0,
  model: 'gpt-4o',
  temperature: 0.7,
};
