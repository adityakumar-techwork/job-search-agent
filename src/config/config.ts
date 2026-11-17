import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Config } from '../types';

// .env.local wins over .env (dotenv never overwrites a variable that is already set, and real
// environment variables — e.g. GitHub Actions secrets — win over both).
if (process.env['NODE_ENV'] !== 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  dotenv.config();
}

export const DEFAULT_LLM_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_LLM_FALLBACK_MODELS = 'gemini-3.1-flash-lite,gemini-3.6-flash';
export const DEFAULT_HUB_KEYWORDS =
  'bangalore,bengaluru,karnataka,delhi,ncr,noida,gurgaon,gurugram,haryana,uttar pradesh';

function readEnv(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
}

// First non-empty value among `keys` (new name first, legacy names after).
function firstEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = readEnv(k);
    if (v !== undefined) return v;
  }
  return undefined;
}

function requireAny(...keys: string[]): string {
  const v = firstEnv(...keys);
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${keys[0]}`);
  }
  return v;
}

function optionalEnv(key: string, defaultValue = ''): string {
  return readEnv(key) ?? defaultValue;
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseIntInRange(key: string, raw: string, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function validateDatabaseUrl(url: string): void {
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must start with postgresql:// or postgres://');
  }
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`RECIPIENT_EMAIL is not a valid email address`);
  }
}

function validateResume(resumePath: string, base64: string): void {
  if (base64) {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64) || Buffer.from(base64, 'base64').length === 0) {
      throw new Error('RESUME_BASE64 is not valid base64');
    }
    return;
  }
  if (!resumePath) {
    throw new Error('Set RESUME_PATH (local file) or RESUME_BASE64 (CI) — neither is set');
  }
  const resolved = path.resolve(process.cwd(), resumePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`RESUME_PATH file not found: ${resolved}`);
  }
}

function validateRegexes(patterns: string[]): void {
  for (const p of patterns) {
    try {
      new RegExp(p, 'gi');
    } catch {
      throw new Error(`ADDITIONAL_REDACTION_PATTERNS contains an invalid regex: ${p}`);
    }
  }
}

export interface ConfigRequirements {
  // The agent run reads the resume file; the API server and digest read the redacted copy from the DB.
  requireResume?: boolean;
  // The digest never calls the LLM.
  requireLlm?: boolean;
}

export function validateAndLoadConfig(req: ConfigRequirements = {}): Config {
  const { requireResume = true, requireLlm = true } = req;
  const databaseUrl = requireAny('DATABASE_URL');
  validateDatabaseUrl(databaseUrl);

  // LLM_API_KEY is the canonical name; GEMINI_API_KEY / CLAUDE_API_KEY are accepted for
  // backwards compatibility with older .env files and secrets.
  const llmApiKey = requireLlm
    ? requireAny('LLM_API_KEY', 'GEMINI_API_KEY', 'CLAUDE_API_KEY')
    : firstEnv('LLM_API_KEY', 'GEMINI_API_KEY', 'CLAUDE_API_KEY') ?? '';
  if (requireLlm && llmApiKey.length < 10) {
    throw new Error('LLM_API_KEY looks invalid (too short)');
  }
  const llmModel = firstEnv('LLM_MODEL', 'CLAUDE_MODEL') ?? DEFAULT_LLM_MODEL;
  if (llmModel.startsWith('claude')) {
    throw new Error(`LLM_MODEL=${llmModel} is a Claude model, but this agent calls the Gemini API. Use a Gemini model ID.`);
  }
  const llmFallbackModels = parseCommaSeparated(optionalEnv('LLM_FALLBACK_MODELS', DEFAULT_LLM_FALLBACK_MODELS));
  const llmMaxTokens = parseIntInRange('LLM_MAX_TOKENS', firstEnv('LLM_MAX_TOKENS', 'CLAUDE_MAX_TOKENS') ?? '4096', 1, 32_000);
  const llmMinIntervalMs = parseIntInRange('LLM_MIN_INTERVAL_MS', optionalEnv('LLM_MIN_INTERVAL_MS', '1000'), 0, 60_000);
  const analysisDescMaxChars = parseIntInRange('ANALYSIS_DESC_MAX_CHARS', optionalEnv('ANALYSIS_DESC_MAX_CHARS', '3500'), 500, 20_000);

  const resumePath = optionalEnv('RESUME_PATH');
  const resumeBase64 = optionalEnv('RESUME_BASE64');
  if (requireResume) validateResume(resumePath, resumeBase64);

  const recipientEmail = optionalEnv('RECIPIENT_EMAIL');
  if (recipientEmail) validateEmail(recipientEmail);

  const patternConfidenceThreshold = Number(optionalEnv('PATTERN_CONFIDENCE_THRESHOLD', '0.5'));
  if (!Number.isFinite(patternConfidenceThreshold) || patternConfidenceThreshold < 0 || patternConfidenceThreshold > 1) {
    throw new Error('PATTERN_CONFIDENCE_THRESHOLD must be a number between 0 and 1');
  }

  const yearsExperience = parseIntInRange('YEARS_EXPERIENCE', optionalEnv('YEARS_EXPERIENCE', '0'), 0, 60);
  const agentMemoryRetentionDays = parseIntInRange(
    'AGENT_MEMORY_RETENTION_DAYS',
    optionalEnv('AGENT_MEMORY_RETENTION_DAYS', '90'),
    1,
    3650,
  );

  const additionalRedactionPatterns = parseCommaSeparated(optionalEnv('ADDITIONAL_REDACTION_PATTERNS', ''));
  validateRegexes(additionalRedactionPatterns);

  const locationPriority = parseCommaSeparated(optionalEnv('LOCATION_PRIORITY', 'bangalore-ncr,remote,other'));
  const knownCategories = new Set(['bangalore-ncr', 'remote', 'other']);
  const unknown = locationPriority.filter((l) => !knownCategories.has(l));
  if (unknown.length > 0) {
    throw new Error(
      `LOCATION_PRIORITY has unknown categories: ${unknown.join(', ')} (allowed: bangalore-ncr, remote, other)`,
    );
  }

  return {
    databaseUrl,
    llmApiKey,
    llmModel,
    llmFallbackModels,
    llmMaxTokens,
    llmMinIntervalMs,
    analysisDescMaxChars,
    userContext: optionalEnv('USER_CONTEXT', ''),
    mailgunApiKey: optionalEnv('MAILGUN_API_KEY'),
    mailgunDomain: optionalEnv('MAILGUN_DOMAIN'),
    mailgunBaseUrl: optionalEnv('MAILGUN_BASE_URL', 'https://api.mailgun.net'),
    recipientEmail,
    dashboardUrl: optionalEnv('DASHBOARD_URL', 'http://localhost:3000'),
    resumePath,
    resumeBase64: resumeBase64 || undefined,
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    jobTitles: parseCommaSeparated(optionalEnv('JOB_TITLES', 'Senior Software Engineer')),
    locationPriority,
    locationKeywords: {
      remote: parseCommaSeparated(optionalEnv('LOCATION_KEYWORDS_REMOTE', 'remote')).map((s) => s.toLowerCase()),
      hub: parseCommaSeparated(
        firstEnv('LOCATION_KEYWORDS_HUB', 'LOCATION_KEYWORDS_WASHINGTON') ?? DEFAULT_HUB_KEYWORDS,
      ).map((s) => s.toLowerCase()),
      other: parseCommaSeparated(optionalEnv('LOCATION_KEYWORDS_OTHER', '')).map((s) => s.toLowerCase()),
    },
    yearsExperience,
    preferredCompanyStage: parseCommaSeparated(optionalEnv('PREFERRED_COMPANY_STAGE', '')),
    excludeKeywords: parseCommaSeparated(optionalEnv('EXCLUDE_KEYWORDS', '')).map((s) => s.toLowerCase()),
    preferredTechnicalStack: parseCommaSeparated(optionalEnv('PREFERRED_TECHNICAL_STACK', '')),
    jobFetchTime: optionalEnv('JOB_FETCH_TIME', '08:00'),
    jobFetchTimezone: optionalEnv('JOB_FETCH_TIMEZONE', 'Asia/Kolkata'),
    weeklyDigestDay: optionalEnv('WEEKLY_DIGEST_DAY', 'sunday'),
    weeklyDigestTime: optionalEnv('WEEKLY_DIGEST_TIME', '18:00'),
    weeklyDigestTimezone: optionalEnv('WEEKLY_DIGEST_TIMEZONE', 'Asia/Kolkata'),
    enablePiiRedaction: optionalEnv('ENABLE_PII_REDACTION', 'true') !== 'false',
    additionalRedactionPatterns,
    agentMemoryRetentionDays,
    enablePatternLearning: optionalEnv('ENABLE_PATTERN_LEARNING', 'true') !== 'false',
    patternConfidenceThreshold,
    rapidApiKey: optionalEnv('RAPIDAPI_KEY'),
  };
}

// The weekly digest is the only entry point that sends email; the agent run and API server
// must not fail just because Mailgun isn't configured.
export function requireEmailConfig(config: Config): void {
  const missing = [
    ['MAILGUN_API_KEY', config.mailgunApiKey],
    ['MAILGUN_DOMAIN', config.mailgunDomain],
    ['RECIPIENT_EMAIL', config.recipientEmail],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) for the digest: ${missing.join(', ')}`);
  }
}
