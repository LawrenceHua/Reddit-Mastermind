import type { ValidationResult, ValidatorConfig } from './types';

// URL detection patterns
const URL_PATTERN = /https?:\/\/[^\s<>"\])}]+/gi;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/gi;

// Common URL shorteners (often spam indicators)
const URL_SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'j.mp',
  'tr.im',
  'cutt.ly',
  'shorturl.at',
];

// Common affiliate/tracking patterns
const AFFILIATE_PATTERNS = [
  /[?&](ref|affiliate|aff|partner|utm_)=/i,
  /\/ref\//i,
  /tag=[a-z0-9-]+/i,
];

// Known spam domains (example list - would be expanded in production)
const SPAM_DOMAINS: string[] = [
  // This would be populated with known spam domains
];

/**
 * Validates content for spam links
 */
export function validateNoSpamLinks(
  content: { title?: string; body: string },
  config?: ValidatorConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const flags: string[] = [];

  const fullText = `${content.title ?? ''} ${content.body}`;
  const allowedDomains = config?.allowedDomains ?? [];

  // Extract all URLs
  const plainUrls = fullText.match(URL_PATTERN) ?? [];
  const markdownMatches = [...fullText.matchAll(MARKDOWN_LINK_PATTERN)];
  const markdownUrls = markdownMatches.map((m) => m[2]);

  const allUrls = [...new Set([...plainUrls, ...markdownUrls])];

  if (allUrls.length === 0) {
    return { valid: true, errors: [], warnings: [], flags: [] };
  }

  flags.push('contains_links');

  for (const url of allUrls) {
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.toLowerCase();

      // Check if domain is in allowed list
      const isAllowed = allowedDomains.some(
        (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
      );

      // Check for URL shorteners
      if (URL_SHORTENERS.some((s) => domain.includes(s))) {
        if (config?.strictMode) {
          errors.push(`URL shortener detected: ${domain}`);
        } else {
          warnings.push(`URL shortener detected: ${domain} - these are often flagged as spam`);
        }
        flags.push('url_shortener');
      }

      // Check for affiliate/tracking parameters
      for (const pattern of AFFILIATE_PATTERNS) {
        if (pattern.test(url)) {
          warnings.push(`Affiliate/tracking parameters detected in: ${url}`);
          flags.push('affiliate_link');
          break;
        }
      }

      // Check for spam domains
      if (SPAM_DOMAINS.includes(domain)) {
        errors.push(`Known spam domain: ${domain}`);
        flags.push('spam_domain');
      }

      // Check if link is to a non-allowed domain (warning only)
      if (!isAllowed && allowedDomains.length > 0) {
        warnings.push(`Link to non-allowed domain: ${domain}`);
        flags.push('external_link');
      }
    } catch {
      // Invalid URL
      warnings.push(`Invalid URL format: ${url}`);
    }
  }

  // Warn about excessive links
  if (allUrls.length > 3) {
    warnings.push(`High number of links (${allUrls.length}) - may trigger spam filters`);
    flags.push('many_links');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    flags: [...new Set(flags)],
  };
}

/**
 * Check if content contains only allowed link types for a subreddit
 */
export function validateSubredditLinkPolicy(
  content: { title?: string; body: string },
  allowedPostTypes: string[]
): ValidationResult {
  const fullText = `${content.title ?? ''} ${content.body}`;
  const hasLinks = URL_PATTERN.test(fullText) || MARKDOWN_LINK_PATTERN.test(fullText);

  // Reset pattern lastIndex
  URL_PATTERN.lastIndex = 0;
  MARKDOWN_LINK_PATTERN.lastIndex = 0;

  // If subreddit is text-only and post has links
  const isTextOnly = allowedPostTypes.length === 1 && allowedPostTypes[0] === 'text';

  if (isTextOnly && hasLinks) {
    return {
      valid: false,
      errors: ['This subreddit only allows text posts, but content contains links'],
      warnings: [],
      flags: ['link_policy_violation'],
    };
  }

  // If subreddit requires links but post has none
  const requiresLinks = allowedPostTypes.includes('link') && !allowedPostTypes.includes('text');

  if (requiresLinks && !hasLinks) {
    return {
      valid: false,
      errors: ['This subreddit requires link posts, but no links found'],
      warnings: [],
      flags: ['link_policy_violation'],
    };
  }

  return { valid: true, errors: [], warnings: [], flags: [] };
}
