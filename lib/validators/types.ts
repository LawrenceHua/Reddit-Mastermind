export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  flags: string[];
}

export interface ValidatorConfig {
  strictMode?: boolean;
  allowedDomains?: string[];
  forbiddenPhrases?: string[];
}

export type ValidatorFn = (
  content: { title?: string; body: string },
  config?: ValidatorConfig
) => ValidationResult;
