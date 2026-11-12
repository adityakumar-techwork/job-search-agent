import { callGeminiWithRetry } from '../utils/gemini-retry';
import axios from 'axios';
import {
  Job,
  JobAnalysis,
  JobAnalysisResult,
  CoverLetterResult,
  PatternLearning,
  AnalysisCategory,
  AgentMemory,
} from '../types';
import { logger } from '../utils/logger';

export interface BatchJobResult {
  analysis: JobAnalysisResult;
}

function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in Gemini response');
  return JSON.parse(match[0]) as T;
}

export function extractRelevantSections(description: string, maxChars: number): string {
  return (description ?? '').slice(0, maxChars).trim();
}

export class ClaudeAnalysisService {
  private tokensInput = 0;
  private tokensOutput = 0;
  private tokensCacheCreation = 0;
  private tokensCacheRead = 0;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly descMaxChars = 4000,
  ) {}

  getTokenUsage() {
    return {
      input: this.tokensInput,
      output: this.tokensOutput,
      cacheCreation: this.tokensCacheCreation,
      cacheRead: this.tokensCacheRead,
    };
  }

  resetTokenUsage(): void {
    this.tokensInput = 0;
    this.tokensOutput = 0;
    this.tokensCacheCreation = 0;
    this.tokensCacheRead = 0;
  }

  private async generateText(prompt: string, maxTokens = 700): Promise<string> {
    const m = this.model || 'gemini-3.8-flash';
    const res = await callGeminiWithRetry(this.apiKey, m,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      },
      { timeout: 60000 },
    );
    const usage = res.data?.usageMetadata ?? {};
    this.tokensInput += usage.promptTokenCount ?? 0;
    this.tokensOutput += usage.candidatesTokenCount ?? 0;
    return res.data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  }

  async analyzeJob(
    job: Job,
    resume: string,
    yearsExperience: number,
    preferredStack: string[],
    memory: AgentMemory[],
    appliedJobs: { title: string; company: string; location?: string }[],
    userContext?: string,
    strategy?: string,
  ): Promise<JobAnalysisResult> {
    const prompt = `Evaluate this job posting for Aditya Kumar (${yearsExperience} yrs experience at Amazon India & Seattle; stack: ${preferredStack.join(', ')}).
${userContext ? `USER RULES: ${userContext}\n` : ''}${strategy ? `STRATEGY: ${strategy}\n` : ''}
CANDIDATE RESUME:
${resume}

JOB TO EVALUATE:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
ATS Requisition ID: ${job.externalId}
Direct ATS URL: ${job.applyUrl}
Description: ${extractRelevantSections(job.description, this.descMaxChars)}

SCORING & FILTERING RULES:
1. STRICTLY REJECT (score 0-25, category "skip") any Engineering Manager, people-management, Frontend/Mobile-only, or junior (<5 yrs) roles.
2. PRIORITIZE pure Individual Contributor (IC) Backend / Distributed Systems roles (SDE-3, Senior SDE, Staff SDE, Lead SDE) at top-paying product/FAANG/fintech companies (>= 40 LPA base).
3. LOCATION RANKING: Boost Bangalore & Delhi-NCR (Noida/Gurgaon) highest (+10), then Remote India (+7), then Hyderabad & Pune (+5).
4. In "insights", explicitly list: (a) ATS Req ID & direct URL for referral outreach, and (b) Top 5-8 missing JD keywords to add to Aditya's Overleaf LaTeX resume.

Respond with ONLY valid JSON:
{
  "relevanceScore": <0-100>,
  "interviewChance": <0-100>,
  "overallCategory": "auto-flag" | "maybe-flag" | "skip",
  "relevanceReasoning": "<concise 1-sentence fit & comp/level assessment>",
  "insights": "Req ID: ${job.externalId} | Missing LaTeX keywords: <comma-separated keywords>",
  "matchedPatterns": ["<matched skill or signal>"]
}`;

    const text = await this.generateText(prompt, 700);
    const raw = extractJson<{
      relevanceScore: number;
      interviewChance: number;
      overallCategory: string;
      relevanceReasoning: string;
      insights: string;
      matchedPatterns: string[];
    }>(text);

    logger.info(`Analyzed job: ${job.title} at ${job.company}`, {
      score: raw.relevanceScore,
      category: raw.overallCategory,
    });

    return {
      relevanceScore: raw.relevanceScore,
      interviewChance: raw.interviewChance,
      overallCategory: raw.overallCategory as AnalysisCategory,
      relevanceReasoning: raw.relevanceReasoning,
      insights: raw.insights,
      matchedPatterns: raw.matchedPatterns ?? [],
    };
  }

  async generateCoverLetter(
    input: { title: string; company: string; relevanceReasoning?: string; insights?: string },
    resume: string,
    focusPatterns: string[] = [],
  ): Promise<CoverLetterResult> {
    const prompt = `Write a short warm-referral message and cover note for ${input.title} at ${input.company}, grounded in this resume:
${resume}
Fit: ${input.relevanceReasoning ?? ''} | Focus: ${focusPatterns.join(', ')}
Respond with ONLY valid JSON:
{ "opening": "<referral ping>", "body": "<impact summary>", "closing": "<call to action>" }`;
    const text = await this.generateText(prompt, 700);
    return extractJson<CoverLetterResult>(text);
  }

  async submitAnalysisBatch(..._args: unknown[]): Promise<string> {
    throw new Error('Batch mode disabled — using real-time Gemini Flash');
  }
  async checkBatchStatus(_batchId?: string): Promise<'in_progress' | 'ended'> {
    return 'ended';
  }
  async processBatchResults(_batchId?: string): Promise<Map<string, BatchJobResult>> {
    return new Map();
  }

  async learnPatterns(analyses: JobAnalysis[], _appliedJobs?: unknown[]): Promise<PatternLearning> {
    const allPatterns = analyses.flatMap((a) => a.matched_patterns ?? []);
    const unique = [...new Set(allPatterns)].slice(0, 8);
    return {
      topSkillsMatched: unique.slice(0, 5),
      commonGaps: [],
      recommendedFocus: ['Distributed Systems', 'Java/Spring Boot', 'High-Throughput Event Streams'],
      bestJobCategories: ['SDE-3 / Senior Backend IC', 'Staff Software Engineer'],
    };
  }
}
