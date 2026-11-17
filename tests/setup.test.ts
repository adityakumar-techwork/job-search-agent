import { requireEmailConfig, validateAndLoadConfig } from '../src/config/config';
import { testConnection, closePool } from '../src/db/client';
import { logger } from '../src/utils/logger';
import { errorMessage } from './helpers';

describe('Config', () => {
  it('loads and validates without error when all required vars are set', () => {
    expect(() => validateAndLoadConfig()).not.toThrow();
  });

  it('throws when LLM_API_KEY is missing', () => {
    const original = process.env['LLM_API_KEY'];
    delete process.env['LLM_API_KEY'];
    expect(() => validateAndLoadConfig()).toThrow('Missing required environment variable: LLM_API_KEY');
    process.env['LLM_API_KEY'] = original;
  });

  it('accepts the legacy CLAUDE_API_KEY name for the Gemini key', () => {
    const original = process.env['LLM_API_KEY'];
    delete process.env['LLM_API_KEY'];
    process.env['CLAUDE_API_KEY'] = 'legacy-gemini-key-123';
    expect(validateAndLoadConfig().llmApiKey).toBe('legacy-gemini-key-123');
    delete process.env['CLAUDE_API_KEY'];
    process.env['LLM_API_KEY'] = original;
  });

  it('rejects a Claude model ID, since the agent calls Gemini', () => {
    process.env['LLM_MODEL'] = 'claude-opus-4-7';
    expect(() => validateAndLoadConfig()).toThrow('is a Claude model');
    delete process.env['LLM_MODEL'];
  });

  it('does not require Mailgun settings for the agent run', () => {
    for (const k of ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN']) delete process.env[k];
    expect(() => validateAndLoadConfig()).not.toThrow();
  });

  it('requireEmailConfig() names every missing Mailgun variable', () => {
    for (const k of ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN']) delete process.env[k];
    expect(() => requireEmailConfig(validateAndLoadConfig())).toThrow('MAILGUN_API_KEY, MAILGUN_DOMAIN');
  });

  it('rejects unknown LOCATION_PRIORITY categories', () => {
    process.env['LOCATION_PRIORITY'] = 'remote,washington';
    expect(() => validateAndLoadConfig()).toThrow('unknown categories: washington');
    delete process.env['LOCATION_PRIORITY'];
  });

  it('skips the resume requirement for the API server / digest', () => {
    const b64 = process.env['RESUME_BASE64'];
    const p = process.env['RESUME_PATH'];
    delete process.env['RESUME_BASE64'];
    delete process.env['RESUME_PATH'];
    expect(() => validateAndLoadConfig()).toThrow('RESUME_PATH');
    expect(() => validateAndLoadConfig({ requireResume: false })).not.toThrow();
    process.env['RESUME_BASE64'] = b64;
    process.env['RESUME_PATH'] = p;
  });

  it('throws when DATABASE_URL has wrong scheme', () => {
    const original = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = 'mysql://user:pass@localhost/db';
    expect(() => validateAndLoadConfig()).toThrow('DATABASE_URL must start with postgresql://');
    process.env['DATABASE_URL'] = original;
  });

  it('throws when RECIPIENT_EMAIL is malformed', () => {
    const original = process.env['RECIPIENT_EMAIL'];
    process.env['RECIPIENT_EMAIL'] = 'not-an-email';
    expect(() => validateAndLoadConfig()).toThrow('RECIPIENT_EMAIL is not a valid email address');
    process.env['RECIPIENT_EMAIL'] = original;
  });

  it('returns typed Config object with arrays parsed', () => {
    const config = validateAndLoadConfig();
    expect(Array.isArray(config.jobTitles)).toBe(true);
    expect(Array.isArray(config.locationPriority)).toBe(true);
    expect(typeof config.yearsExperience).toBe('number');
    expect(typeof config.patternConfidenceThreshold).toBe('number');
  });
});

describe('Logger', () => {
  it('never logs Claude API key', () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      lines.push(chunk.toString());
      return true;
    };

    logger.info('Testing key redaction', { key: 'sk-ant-abc123xyz' });

    process.stdout.write = original;

    const output = lines.join('');
    expect(output).not.toContain('sk-ant-abc123xyz');
    expect(output).toContain('[REDACTED]');
  });

  it('never logs SendGrid key', () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      lines.push(chunk.toString());
      return true;
    };

    logger.info('Testing sendgrid redaction', { key: 'SG.testkey123' });

    process.stdout.write = original;

    const output = lines.join('');
    expect(output).not.toContain('SG.testkey123');
    expect(output).toContain('[REDACTED]');
  });

  it('never logs Gemini keys or key query params', () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      lines.push(chunk.toString());
      return true;
    };
    logger.info('call failed https://x/models/m:generateContent?key=AIzaSyA1234567890abcdefghijklmnopqrstuv', {
      error: 'AIzaSyA1234567890abcdefghijklmnopqrstuv',
    });
    process.stdout.write = original;
    expect(lines.join('')).not.toContain('AIzaSyA1234567890');
  });

  it('outputs valid JSON', () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      lines.push(chunk.toString());
      return true;
    };

    logger.info('JSON format test', { foo: 'bar' });

    process.stdout.write = original;

    const output = lines.join('').trim();
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('level', 'info');
    expect(parsed).toHaveProperty('message', 'JSON format test');
  });
});

describe('Database', () => {
  afterAll(async () => {
    await closePool();
  });

  it('connects to the database successfully', async () => {
    try {
      await testConnection();
    } catch (err) {
      const message = errorMessage(err);
      // Skip gracefully when Postgres is not running locally
      if (
        message.includes('ECONNREFUSED') ||
        message.includes('connect ETIMEDOUT') ||
        message.includes('password authentication failed') ||
        message.includes('does not exist')
      ) {
        console.warn('Skipping DB test — no local PostgreSQL available');
        return;
      }
      throw err;
    }
  });
});