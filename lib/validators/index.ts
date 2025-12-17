import type { ValidationResult, ValidatorConfig } from './types';
import { validateNoVoteManipulationLanguage } from './vote-manipulation';
import { validateNoUndisclosedAffiliationClaims, validateDisclosurePresent } from './affiliation';
import { validateNoSpamLinks, validateSubredditLinkPolicy } from './spam-links';

export { validateNoVoteManipulationLanguage } from './vote-manipulation';
export { validateNoUndisclosedAffiliationClaims, validateDisclosurePresent } from './affiliation';
export { validateNoSpamLinks, validateSubredditLinkPolicy } from './spam-links';
export type { ValidationResult, ValidatorConfig, ValidatorFn } from './types';

/**
 * Run all validators on content
 */
export function validateContent(
  content: { title?: string; body: string },
  options: {
    disclosureRequired?: boolean;
    companyName?: string;
    allowedDomains?: string[];
    allowedPostTypes?: string[];
    strictMode?: boolean;
  } = {}
): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const allFlags: string[] = [];

  const config: ValidatorConfig = {
    strictMode: options.strictMode,
    allowedDomains: options.allowedDomains,
  };

  // Run vote manipulation validator
  const voteResult = validateNoVoteManipulationLanguage(content, config);
  allErrors.push(...voteResult.errors);
  allWarnings.push(...voteResult.warnings);
  allFlags.push(...voteResult.flags);

  // Run affiliation validator
  const affiliationResult = validateNoUndisclosedAffiliationClaims(content, config);
  allErrors.push(...affiliationResult.errors);
  allWarnings.push(...affiliationResult.warnings);
  allFlags.push(...affiliationResult.flags);

  // Run disclosure validator if required
  if (options.disclosureRequired && options.companyName) {
    const disclosureResult = validateDisclosurePresent(
      content,
      options.disclosureRequired,
      options.companyName
    );
    allErrors.push(...disclosureResult.errors);
    allWarnings.push(...disclosureResult.warnings);
    allFlags.push(...disclosureResult.flags);
  }

  // Run spam link validator
  const spamResult = validateNoSpamLinks(content, config);
  allErrors.push(...spamResult.errors);
  allWarnings.push(...spamResult.warnings);
  allFlags.push(...spamResult.flags);

  // Run subreddit link policy validator if post types specified
  if (options.allowedPostTypes && options.allowedPostTypes.length > 0) {
    const linkPolicyResult = validateSubredditLinkPolicy(content, options.allowedPostTypes);
    allErrors.push(...linkPolicyResult.errors);
    allWarnings.push(...linkPolicyResult.warnings);
    allFlags.push(...linkPolicyResult.flags);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    flags: [...new Set(allFlags)],
  };
}

/**
 * Determine if flags represent critical issues
 */
export function hasCriticalFlags(flags: string[]): boolean {
  const criticalFlags = [
    'vote_manipulation',
    'coordinated_voting',
    'fake_neutrality',
    'spam_domain',
    'missing_disclosure',
    'link_policy_violation',
  ];

  return flags.some((flag) => criticalFlags.includes(flag));
}
