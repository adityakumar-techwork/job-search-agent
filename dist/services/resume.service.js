"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResumeService = void 0;
exports.extractSeniorityLevel = extractSeniorityLevel;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
// pdf-parse v1 is a CJS module with no bundled types; require avoids the declaration gap
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
// SSN must run before phone to prevent partial overlaps on digit sequences.
const REDACTION_PATTERNS = [
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]', label: 'SSN' },
    // Covers: +1(425)606-1234, (425) 606-1234, 425-606-1234, 425.606.1234, 4256061234
    { pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[REDACTED_PHONE]', label: 'phone' },
    { pattern: /[\w.\-]+@[\w.\-]+\.\w+/g, replacement: '[REDACTED_EMAIL]', label: 'email' },
    { pattern: /\b\d{5}(?:-\d{4})?\b/g, replacement: '[REDACTED_ZIP]', label: 'zipcode' },
    { pattern: /(?:\d{1,2}\/){2}\d{4}/g, replacement: '[REDACTED_DOB]', label: 'DOB' },
    { pattern: /References:[\s\S]*$/gi, replacement: '[REDACTED_REFERENCES]', label: 'references' },
];
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
function extractSeniorityLevel(text) {
    for (const level of SENIORITY_LEVELS) {
        if (new RegExp(`\\b${level}\\b`, 'i').test(text))
            return level;
    }
    return undefined;
}
function extractYearsExperience(text) {
    const match = text.match(/(\d+)\+?\s+years?(?:\s+of)?\s+experience/i);
    return match?.[1] ? parseInt(match[1], 10) : undefined;
}
function extractTechnologies(text) {
    // Longer multi-word keywords first to avoid partial matches (e.g. "Spring Boot" before "Spring")
    return TECH_KEYWORDS.filter((tech) => new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
}
function extractCompanies(text) {
    const companies = [];
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
function extractEducationLevel(text) {
    if (/\bPh\.?D\.?\b/i.test(text))
        return 'PhD';
    if (/\bM\.?S\.?\b|\bMasters?\b|\bM\.?Eng\.?\b/i.test(text))
        return 'MS';
    if (/\bB\.?S\.?\b|\bBachelors?\b|\bB\.?Eng\.?\b|\bB\.?A\.?\b/i.test(text))
        return 'BS';
    return undefined;
}
function extractCertifications(text) {
    return CERTIFICATION_PATTERNS.filter((cert) => new RegExp(cert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
}
function extractSoftSkills(text) {
    return SOFT_SKILL_KEYWORDS.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text));
}
function redactText(text) {
    let redacted = text;
    const counts = {};
    for (const { pattern, replacement, label } of REDACTION_PATTERNS) {
        const matches = redacted.match(pattern);
        counts[label] = matches ? matches.length : 0;
        redacted = redacted.replace(pattern, replacement);
    }
    return { redacted, counts };
}
class ResumeService {
    async loadAndRedact(resumePath) {
        const fileBuffer = fs.readFileSync(resumePath);
        const ext = path.extname(resumePath).toLowerCase();
        let originalText;
        if (ext === '.pdf') {
            const result = await pdfParse(fileBuffer);
            originalText = result.text;
        }
        else {
            originalText = fileBuffer.toString('utf8');
        }
        const hash = crypto.createHash('sha256').update(originalText).digest('hex');
        const { redacted: redactedText, counts } = redactText(originalText);
        const metadata = {
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
        logger_1.logger.info(`Loaded resume: ${originalText.length.toLocaleString()} chars → ` +
            `${redactedText.length.toLocaleString()} after redaction` +
            (redactedSummary ? ` (${redactedSummary} redacted)` : ''));
        return { redactedText, hash, metadata };
    }
}
exports.ResumeService = ResumeService;
//# sourceMappingURL=resume.service.js.map