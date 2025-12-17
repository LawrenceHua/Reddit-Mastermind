import type { RiskLevel } from '@/lib/database.types';

export interface Subreddit {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  maxPostsPerWeek: number;
  allowedPostTypes: string[];
  rulesText: string | null;
}

export interface Persona {
  id: string;
  name: string;
  bio: string | null;
  tone: string | null;
  expertiseTags: string[];
  disclosureRequired: boolean;
}

export interface TopicSeed {
  id: string;
  seedType: 'target_query' | 'pain_point' | 'competitor' | 'faq';
  text: string;
  tags: string[];
  priority: number;
}

export interface PlannerConfig {
  postsPerWeek: number;
  riskTolerance: RiskLevel;
  historyWindowWeeks: number;
  minPersonaSpacingHours: number;
  maxCandidatesPerSlot: number;
}

export interface PostSlot {
  index: number;
  scheduledAt: Date;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
}

export interface AssignedSlot extends PostSlot {
  subredditId: string;
  personaId: string;
}

export interface SlotConstraints {
  maxPostsPerSubreddit: Map<string, number>;
  subredditRiskLevels: Map<string, RiskLevel>;
  personaSpacingHours: number;
  riskTolerance: RiskLevel;
}

export interface AssignmentResult {
  slots: AssignedSlot[];
  warnings: string[];
  errors: string[];
}

// Historical data for deduplication
export interface HistoricalPost {
  topicClusterKey: string;
  subredditId: string;
  personaId: string;
  scheduledAt: Date;
}

// Seeded random number generator interface
export interface SeededRandom {
  next(): number;
  nextInt(max: number): number;
  shuffle<T>(array: T[]): T[];
}
