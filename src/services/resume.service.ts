import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ResumeMetadata } from '../types';
import { logger } from '../utils/logger';

// pdf-parse v1 is a CJS module with no bundled types; require avoids the declaration gap
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

// PII redaction happens BEFORE any processing, storage, or transmission.
// Original resume never stored in DB, never sent to the LLM API, never logged.
// Only the redacted version persists in memory and the database.

interface RedactionPattern {
  pattern: RegExp;
  replacement: string;
  label: string;
}

const INDIA_PLACE =
  /\b(india|bangalore|bengaluru|karnataka|delhi|ncr|noida|gurgaon|gurugram|haryana|uttar pradesh|mumbai|maharashtra|pune|hyderabad|telangana|chennai|tamil nadu|kolkata|west bengal|ahmedabad|gujarat|jaipur|rajasthan|kerala|kochi|chandigarh|punjab|lucknow|indore|bhopal)\b/i;

// Order matters: identity numbers before phones (digit-run overlap), Indian phone formats before
// the generic 3-3-4 pattern, URLs before emails.
const REDACTION_PATTERNS: RedactionPattern[] = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]', label: 'SSN' },
  // Aadhaar: 12 digits, usually 4-4-4
  { pattern: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED_ID]', label: 'Aadhaar' },
  // PAN: AAAAA9999A
  { pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replacement: '[REDACTED_ID]', label: 'PAN' },
  { pattern: /\b(?:passport(?:\s*(?:no|number))?\.?\s*[:#-]?\s*)[A-Z]\d{7}\b/gi, replacement: '[REDACTED_ID]', label: 'passport' },
  // Indian mobiles: +91 98765 43210, +91-9876543210, 09876543210, 98765-43210, 987 654 3210
  {
    pattern: /(?:\+91[-.\s]?|\b0)?(?<!\d)[6-9]\d{4}[-.\s]?\d{5}(?!\d)|(?:\+91[-.\s]?)(?<!\d)[6-9]\d{2}[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g,
    replacement: '[REDACTED_PHONE]',
    label: 'phone',
  },
  // Generic / North American: +1(425)606-1234, (425) 606-1234, 425-606-1234, 425.606.1234, 4256061234
  { pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]', label: 'phone' },
  // Profile URLs that identify the person
  {
    pattern: /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in|github\.com|gitlab\.com|twitter\.com|x\.com|leetcode\.com(?:\/u)?|medium\.com\/@?)\/?[A-Za-z0-9_.\-%]+\/?/gi,
    replacement: '[REDACTED_PROFILE_URL]',
    label: 'profile URL',
  },
  { pattern: /[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/g, replacement: '[REDACTED_EMAIL]', label: 'email' },
  // US ZIP only after a state code ("Seattle, WA 98101") so ordinary 5-digit numbers survive.
  { pattern: /\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/g, replacement: '$1 [REDACTED_ZIP]', label: 'zipcode' },
  { pattern: /\b(?:\d{1,2}[\/.-]){2}(?:19|20)\d{2}\b/g, replacement: '[REDACTED_DOB]', label: 'DOB' },
  { pattern: /\b(?:date of birth|dob|d\.o\.b\.?)\s*[:\-]?\s*[^\n]+/gi, replacement: '[REDACTED_DOB]', label: 'DOB' },
  { pattern: /References:[\s\S]*$/gi, replacement: '[REDACTED_REFERENCES]', label: 'references' },
];

// Indian PIN codes (6 digits) only on lines that also name an Indian place, so metrics like
// "100000 requests/s" are not redacted.
function redactIndianPinCodes(text: string): { text: string; count: number } {
  let count = 0;
  const out = text
    .split('\n')
    .map((line) => {
      if (!INDIA_PLACE.test(line) && !/\bpin\s*(?:code)?\b/i.test(line)) return line;
      return line.replace(/\b[1-9]\d{2}\s?\d{3}\b/g, () => {
        count++;
        return '[REDACTED_PIN]';
      });
    })
    .join('\n');
  return { text: out, count };
}

// The candidate's name is almost always the first non-empty line. Accept 2-4 capitalised words
// with no digits/@; redact every occurrence of it (and of each 3+ letter part on its own).
export function detectName(text: string): string | undefined {
  const first = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  if (!first || first.length > 50 || /[\d@:|/]/.test(first)) return undefined;
  const words = first.split(/\s+/);
  if (words.length < 2 || words.length > 4) return undefined;
  if (!words.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w) || /^[A-Z][A-Z.'-]+$/.test(w))) return undefined;
  if (/\b(resume|curriculum|vitae|cv|engineer|developer|summary)\b/i.test(first)) return undefined;
  return first;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface RedactionOptions {
  enabled?: boolean;
  additionalPatterns?: string[];
}

export function redactText(text: string, opts: RedactionOptions = {}): { redacted: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  if (opts.enabled === false) return { redacted: text, counts };

  let redacted = text;
  const name = detectName(redacted);
  if (name) {
    const parts = [name, ...name.split(/\s+/).filter((p) => p.replace(/\W/g, '').length >= 3)];
    for (const part of parts) {
      const re = new RegExp(`\\b${escapeRegex(part)}\\b`, 'g');
      const n = (redacted.match(re) ?? []).length;
      if (n > 0) {
        counts['name'] = (counts['name'] ?? 0) + n;
        redacted = redacted.replace(re, '[REDACTED_NAME]');
      }
    }
    redacted = redacted.replace(/\[REDACTED_NAME\](?:\s+\[REDACTED_NAME\])+/g, '[REDACTED_NAME]');
  }

  for (const { pattern, replacement, label } of REDACTION_PATTERNS) {
    const matches = redacted.match(pattern);
    counts[label] = (counts[label] ?? 0) + (matches ? matches.length : 0);
    redacted = redacted.replace(pattern, replacement);
  }

  const pin = redactIndianPinCodes(redacted);
  redacted = pin.text;
  counts['PIN code'] = pin.count;

  for (const p of opts.additionalPatterns ?? []) {
    const re = new RegExp(p, 'gi');
    const matches = redacted.match(re);
    counts['custom'] = (counts['custom'] ?? 0) + (matches ? matches.length : 0);
    redacted = redacted.replace(re, '[REDACTED]');
  }
  return { redacted, counts };
}

const TECH_KEYWORDS = [
  'Java', 'Python', 'JavaScript', 'TypeScript', 'Go', 'Golang', 'Rust', 'C++', 'C#', 'Ruby', 'Scala', 'Kotlin', 'Swift',
  'Spring Boot', 'Spring', 'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'FastAPI', 'Rails',
  'Kafka', 'RabbitMQ', 'Redis', 'Elasticsearch', 'Solr', 'Cassandra', 'MongoDB', 'DynamoDB',
  'PostgreSQL', 'MySQL', 'Oracle', 'SQL Server', 'SQLite',
  'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'CircleCI',
  'Spark', 'Hadoop', 'Airflow', 'Flink',
  'gRPC', 'GraphQL', 'Microservices', 'Prometheus', 'Grafana', 'Datadog',
  'AWS', 'GCP', 'Azure',
];

const CERTIFICATION_PATTERNS = [
  'AWS Certified', 'AWS Solutions Architect', 'AWS Developer', 'AWS DevOps',
  'GCP Professional', 'Google Cloud', 'Azure Certified',
  'CKA', 'CKAD', 'CKS', 'PMP', 'CISSP', 'CISA', 'CISM',
  'Cloud Practitioner', 'Solutions Architect', 'Developer Associate',
];

const SOFT_SKILL_KEYWORDS = [
  'leadership', 'mentoring', 'mentorship', 'communication', 'collaboration',
  'teamwork', 'problem-solving', 'analytical', 'strategic', 'initiative', 'ownership',
];

const SENIORITY_LEVELS = ['Principal', 'Staff', 'Senior', 'Lead', 'Junior', 'Associate', 'Intern'];

export function extractSeniorityLevel(text: string): string | undefined {
  for (const level of SENIORITY_LEVELS) {
    if (new RegExp(`\\b${level}\\b`, 'i').test(text)) return level;
  }
  return undefined;
}

function extractYearsExperience(text: string): number | undefined {
  const match = text.match(/(\d+)\+?\s+years?(?:\s+of)?\s+experience/i);
  return match?.[1] ? parseInt(match[1], 10) : undefined;
}

function extractTechnologies(text: string): string[] {
  // Longer multi-word keywords first to avoid partial matches (e.g. "Spring Boot" before "Spring")
  return TECH_KEYWORDS.filter((tech) =>
    new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text),
  );
}

function extractCompanies(text: string): string[] {
  const companies: string[] = [];
  const atPattern = /(?:^|\s)(?:at|for|@)\s+([A-Z][A-Za-z0-9&\s.,'-]+?)(?=\s*[,(\n|]|$)/gm;
  let match;
  while ((match = atPattern.exec(text)) !== null) {
    const company = match[1]?.trim().replace(/\s+/g, ' ');
    if (company && company.length >= 2 && company.length <= 60) {
      companies.push(company);
    }
  }
  return [...new Set(companies)];
}

function extractEducationLevel(text: string): string | undefined {
  if (/\bPh\.?D\.?\b/i.test(text)) return 'PhD';
  if (/\bM\.?S\.?\b|\bMasters?\b|\bM\.?Eng\.?\b/i.test(text)) return 'MS';
  if (/\bB\.?S\.?\b|\bBachelors?\b|\bB\.?Eng\.?\b|\bB\.?A\.?\b/i.test(text)) return 'BS';
  return undefined;
}

function extractCertifications(text: string): string[] {
  return CERTIFICATION_PATTERNS.filter((cert) =>
    new RegExp(cert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text),
  );
}

function extractSoftSkills(text: string): string[] {
  return SOFT_SKILL_KEYWORDS.filter((skill) =>
    new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text),
  );
}

export interface ResumeSource {
  path?: string;
  base64?: string;
}

async function readResumeText(source: ResumeSource): Promise<string> {
  let buffer: Buffer;
  let isPdf: boolean;
  if (source.base64) {
    buffer = Buffer.from(source.base64, 'base64');
    isPdf = buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  } else if (source.path) {
    buffer = fs.readFileSync(source.path);
    isPdf = path.extname(source.path).toLowerCase() === '.pdf' || buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  } else {
    throw new Error('No resume source: set RESUME_PATH or RESUME_BASE64');
  }
  const text = isPdf ? (await pdfParse(buffer)).text : buffer.toString('utf8');
  if (!text.trim()) {
    throw new Error('Resume is empty (a scanned/image-only PDF has no extractable text — export a text PDF)');
  }
  return text;
}

export class ResumeService {
  constructor(private readonly redaction: RedactionOptions = {}) {}

  // Accepts a file path (legacy) or { path, base64 }. RESUME_BASE64 wins when both are set.
  async loadAndRedact(source: string | ResumeSource): Promise<{
    redactedText: string;
    hash: string;
    metadata: ResumeMetadata;
  }> {
    const src: ResumeSource = typeof source === 'string' ? { path: source } : source;
    const originalText = await readResumeText(src);

    if (this.redaction.enabled === false) {
      logger.warn('ENABLE_PII_REDACTION=false — the unredacted resume will be stored and sent to the LLM');
    }

    const hash = crypto.createHash('sha256').update(originalText).digest('hex');
    const { redacted: redactedText, counts } = redactText(originalText, this.redaction);
    const metadata: ResumeMetadata = {
      resumeHash: hash,
      resumeRedacted: redactedText,
      isCurrent: true,
      yearsExperience: extractYearsExperience(redactedText),
      technologies: extractTechnologies(redactedText),
      companies: extractCompanies(redactedText),
      educationLevel: extractEducationLevel(redactedText),
      certifications: extractCertifications(redactedText),
      softSkills: extractSoftSkills(redactedText),
    };

    const redactedSummary = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${n} ${label}`)
      .join(', ');

    logger.info(
      `Loaded resume: ${originalText.length.toLocaleString()} chars → ` +
        `${redactedText.length.toLocaleString()} after redaction` +
        (redactedSummary ? ` (${redactedSummary} redacted)` : ''),
    );

    return { redactedText, hash, metadata };
  }
}