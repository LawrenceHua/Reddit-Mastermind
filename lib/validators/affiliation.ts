import type { ValidationResult, ValidatorConfig } from './types';

// Patterns suggesting undisclosed affiliation claims
const FAKE_NEUTRALITY_PATTERNS = [
  /\bi('m| am)\s+not\s+(affiliated|associated|connected)\s+(with|to)/i,
  /\bno\s+(affiliation|connection)\s+(with|to)/i,
  /\bjust\s+a\s+(regular|normal|random)\s+(user|person|customer)/i,
  /\bi('m| am)\s+just\s+a\s+(satisfied|happy)\s+customer/i,
  /\bi\s+have\s+no\s+stake\s+in/i,
  /\bfull\s+disclosure[:\s]+i('m| am)\s+not/i,
];

// Patterns suggesting astroturfing
const ASTROTURF_PATTERNS = [
  /\bwe\s+should\s+all\s+(try|use|check\s+out)\b/i,
  /\beveryone\s+needs\s+to\s+(know|see|try)\b/i,
  /\bspreading\s+the\s+word\b/i,
  /\bget\s+the\s+word\s+out\b/i,
  /\bgrass\s*roots\s+movement\b/i,
];

// Overly promotional patterns
const PROMOTIONAL_PATTERNS = [
  /\bgame\s*changer\b/i,
  /\blife\s*changing\b/i,
  /\bbest\s+thing\s+(ever|I'?ve\s+(ever\s+)?(used|tried|seen))\b/i,
  /\byou\s+won'?t\s+(believe|regret)\b/i,
  /\b(act|buy|sign\s+up)\s+now\b/i,
  /\blimited\s+time\s+(offer|deal)\b/i,
  /\bdon'?t\s+miss\s+(out|this)\b/i,
  /\bhurry\b.*\b(before|while)\b/i,
];

/**
 * Validates content for undisclosed affiliation claims
 * Catches fake neutrality claims and astroturfing patterns
 */
export function validateNoUndisclosedAffiliationClaims(
  content: { title?: string; body: string },
  config?: ValidatorConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const flags: string[] = [];

  const fullText = `${content.title ?? ''} ${content.body}`;

  // Check fake neutrality patterns
  for (const pattern of FAKE_NEUTRALITY_PATTERNS) {
    if (pattern.test(fullText)) {
      errors.push(`Contains suspicious neutrality claim: "${fullText.match(pattern)?.[0]}"`);
      flags.push('fake_neutrality');
    }
  }

  // Check astroturfing patterns
  for (const pattern of ASTROTURF_PATTERNS) {
    if (pattern.test(fullText)) {
      warnings.push(`Contains potential astroturfing language: "${fullText.match(pattern)?.[0]}"`);
      flags.push('potential_astroturf');
    }
  }

  // Check promotional patterns
  let promotionalCount = 0;
  for (const pattern of PROMOTIONAL_PATTERNS) {
    if (pattern.test(fullText)) {
      promotionalCount++;
      flags.push('promotional_language');
    }
  }

  if (promotionalCount >= 3) {
    errors.push('Contains excessive promotional language');
  } else if (promotionalCount > 0) {
    warnings.push(`Contains ${promotionalCount} promotional phrase(s) - review for authenticity`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    flags: [...new Set(flags)],
  };
}

/**
 * Check if proper disclosure is included when required
 */
export function validateDisclosurePresent(
  content: { title?: string; body: string },
  disclosureRequired: boolean,
  companyName: string
): ValidationResult {
  if (!disclosureRequired) {
    return { valid: true, errors: [], warnings: [], flags: [] };
  }

  const fullText = `${content.title ?? ''} ${content.body}`.toLowerCase();
  const companyLower = companyName.toLowerCase();

  // Look for disclosure patterns
  const disclosurePatterns = [
    /\bdisclosure[:\s]/i,
    /\bi\s+work\s+(for|at|with)\b/i,
    /\bi('m| am)\s+(affiliated|associated)\s+with\b/i,
    /\bfull\s+transparency[:\s]/i,
    /\bi\s+should\s+mention\b/i,
    /\bin\s+the\s+interest\s+of\s+transparency\b/i,
  ];

  const hasDisclosure = disclosurePatterns.some((p) => p.test(fullText));
  const mentionsCompany = fullText.includes(companyLower);

  if (!hasDisclosure || !mentionsCompany) {
    return {
      valid: false,
      errors: [`Disclosure required but not found. Must disclose affiliation with ${companyName}.`],
      warnings: [],
      flags: ['missing_disclosure'],
    };
  }

  return { valid: true, errors: [], warnings: [], flags: ['has_disclosure'] };
}
