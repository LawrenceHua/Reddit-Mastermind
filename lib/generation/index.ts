export { generateCandidatesForSlot, calculateHeuristicScore } from './generate';
export type {
  GenerationInput,
  ScoredCandidate,
  SlotGenerationResult,
  WeekGenerationResult,
  GenerationConfig,
} from './types';
export { DEFAULT_GENERATION_CONFIG } from './types';

// Thread generation
export {
  generateThreadContent,
  assetsToDbInserts,
} from './thread-generate';
export type {
  ThreadGenerationContext,
  GeneratedAsset,
  ThreadGenerationResult,
  LLMGenerateFunction,
} from './thread-generate';
