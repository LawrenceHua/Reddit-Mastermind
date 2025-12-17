import type { ValidationResult, ValidatorConfig } from './types';

// Phrases that suggest vote manipulation
const VOTE_MANIPULATION_PATTERNS = [
  /\bupvote\s+(this|me|if)\b/i,
  /\bplease\s+upvote\b/i,
  /\bkarma\s+farm/i,
  /\bgive\s+me\s+(karma|upvotes?)\b/i,
  /\bupvote\s+for\s+visibility\b/i,
  /\bhelp\s+me\s+get\s+(karma|upvotes?)\b/i,
  /\blet'?s\s+get\s+this\s+to\s+(the\s+)?top\b/i,
  /\bsmash\s+that\s+upvote\b/i,
  /\bupvote\s+party\b/i,
  /\bfree\s+karma\b/i,
  /\bdownvote\s+(brigade|them|this|the\s+competition)\b/i,
  /\bupvote\s+everything\b/i,
];

// Phrases suggesting coordinated behavior
const COORDINATION_PATTERNS = [
  /\bjoin\s+us\s+in\s+(upvoting|downvoting)\b/i,
  /\beveryone\s+(upvote|downvote)\b/i,
  /\blet'?s\s+all\s+(upvote|downvote)\b/i,
  /\bgo\s+to\s+\[?\w+\]?\s+and\s+(upvote|downvote)\b/i,
  /\braid\s+this\s+(sub|thread|post)\b/i,
  /\bbrigade\b/i,
];

/**
 * Validates content for vote manipulation language
 * Reddit explicitly prohibits asking for upvotes or coordinated voting
 */
export function validateNoVoteManipulationLanguage(
  content: { title?: string; body: string },
  config?: ValidatorConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const flags: string[] = [];

  const fullText = `${content.title ?? ''} ${content.body}`;

  // Check vote manipulation patterns
  for (const pattern of VOTE_MANIPULATION_PATTERNS) {
    if (pattern.test(fullText)) {
      errors.push(`Contains vote manipulation language: "${fullText.match(pattern)?.[0]}"`);
      flags.push('vote_manipulation');
    }
  }

  // Check coordination patterns
  for (const pattern of COORDINATION_PATTERNS) {
    if (pattern.test(fullText)) {
      errors.push(`Contains coordinated voting language: "${fullText.match(pattern)?.[0]}"`);
      flags.push('coordinated_voting');
    }
  }

  // Soft check for mentions of voting (warning only)
  if (/\b(upvote|downvote|karma)\b/i.test(fullText) && errors.length === 0) {
    warnings.push('Contains voting-related terms - review for appropriateness');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    flags: [...new Set(flags)],
  };
}
