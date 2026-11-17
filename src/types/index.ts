export interface Config {
  // Database
  databaseUrl: string;

  // LLM (Gemini)
  llmApiKey: string;
  llmModel: string;
  llmFallbackModels: string[];
  llmMaxTokens: number;
  llmMinIntervalMs: number;
  analysisDescMaxChars: number;

  // Mailgun (only required by the weekly digest — see requireEmailConfig)
  mailgunApiKey: string;
  mailgunDomain: string;
  mailgunBaseUrl: string;
  recipientEmail: string;
  dashboardUrl: string;

  // Job APIs
  rapidApiKey: string;

  // Resume
  resumePath: string;
  resumeBase64?: string;

  // User context
  userContext: string;

  // Agent behaviour
  nodeEnv: string;
  jobTitles: string[];
  locationPriority: string[];
  locationKeywords: LocationKeywords;
  yearsExperience: number;
  preferredCompanyStage: string[];
  excludeKeywords: string[];
  preferredTechnicalStack: string[];

  // Schedule
  jobFetchTime: string;
  jobFetchTimezone: string;
  weeklyDigestDay: string;
  weeklyDigestTime: string;
  weeklyDigestTimezone: string;

  // PII Redaction
  enablePiiRedaction: boolean;
  additionalRedactionPatterns: string[];

  // Learning
  agentMemoryRetentionDays: number;
  enablePatternLearning: boolean;
  patternConfidenceThreshold: number;
}

export interface ResumeMetadata {
  id?: string;
  yearsExperience?: number;
  technologies?: string[];
  companies?: string[];
  educationLevel?: string;
  certifications?: string[];
  softSkills?: string[];
  resumeHash: string;
  resumeRedacted: string;
  loadedAt?: Date;
  lastVerifiedAt?: Date;
  isCurrent: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Job {
  id?: string;
  source: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  locationCategory?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applyUrl: string;
  postedAt?: Date;
  fetchedAt?: Date;
  isActive: boolean;
  recruiterName?: string;
  recruiterEmail?: string;
  companyHiringUrl?: string;
  companySize?: string;
  companyWebsite?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OverallCategory = 'auto-flag' | 'maybe-flag' | 'needs-review' | 'skip';
export type LocationCategory = 'bangalore-ncr' | 'remote' | 'other';
export type AnalysisCategory = 'auto-flag' | 'maybe-flag' | 'skip';

export interface JobAnalysisResult {
  relevanceScore: number;
  interviewChance: number;
  overallCategory: AnalysisCategory;
  relevanceReasoning: string;
  insights: string;
  matchedPatterns: string[];
  missingKeywords?: string[];
}

export interface CoverLetterResult {
  opening: string;
  body: string;
  closing: string;
}

export interface PatternLearning {
  topSkillsMatched: string[];
  commonGaps: string[];
  recommendedFocus: string[];
  bestJobCategories: string[];
}

export interface ClaudeAnalysis {
  id?: string;
  jobId: string;
  relevanceScore: number;
  interviewChance: number;
  locationCategory: LocationCategory;
  overallCategory: OverallCategory;
  relevanceReasoning?: string;
  insights?: string;
  coverLetterDraft?: string;
  matchedPatterns?: string[];
  isStale: boolean;
  staleReason?: string;
  analyzedAt?: Date;
  createdAt?: Date;
}

export interface AgentMemory {
  id?: string;
  patternName: string;
  patternType: string;
  patternData: Record<string, unknown>;
  confidenceScore: number;
  firstObservedAt?: Date;
  lastObservedAt?: Date;
  observationCount: number;
  recommendations?: string;
  nextStrategyFocus?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JobAnalysis {
  job_id: string;
  company: string;
  relevance_score: number;
  interview_chance: number;
  location_category: string;
  overall_category: string;
  relevance_reasoning: string;
  insights: string;
  matched_patterns: string[];
  cover_letter_draft?: string;
}

export interface TokenBudget {
  maxContextTokens: number;
  safetyMargin: number;
  resume: number;
  agentMemory: number;
  jobsToAnalyze: number;
  buffer: number;
}

export interface RunningAgentContext {
  resume: {
    redactedText: string;
    hash: string;
    metadata: ResumeMetadata;
  };
  memory: AgentMemory[];
  appliedJobs: { title: string; company: string; location?: string }[];
  currentStrategy: string;
  jobsToAnalyze: Job[];
  analyses: JobAnalysis[];
}

// Keyword lists (lowercase substrings) used to bucket a job's location into a category.
// `hub` maps to the 'bangalore-ncr' category.
export interface LocationKeywords {
  remote: string[];
  hub: string[];
  other: string[];
}

export interface SearchCriteria {
  jobTitles: string[];
  excludeKeywords?: string[];
  locationPriority: string[];
  yearsExperience: number;
  preferredStack: string[];
  locationKeywords?: LocationKeywords;
}

export interface JobFetcher {
  fetch(criteria: SearchCriteria): Promise<Job[]>;
}

export type ApplicationStatus =
  | 'applied'
  | 'interview_scheduled'
  | 'rejected'
  | 'offer'
  | 'archived';

export interface Application {
  id?: string;
  jobId: string;
  claudeAnalysisId?: string;
  appliedAt?: Date;
  status: ApplicationStatus;
  coverLetterUsed?: string;
  userNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}