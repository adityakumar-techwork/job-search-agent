import { callGeminiWithRetry } from '../utils/gemini-retry';
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

  private async generateText(prompt: string, maxTokens = 750): Promise<string> {
    const m = this.model || 'gemini-3.5-flash-lite';
    const res = await callGeminiWithRetry(
      this.apiKey,
      m,
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
    const appliedSignal =
      appliedJobs.length > 0
        ? `RECENTLY APPLIED ROLES (boost similar seniority/domain): ${appliedJobs
            .slice(0, 8)
            .map((a) => `${a.title} at ${a.company}`)
            .join('; ')}\n`
        : '';
    const memorySignal =
      memory.length > 0
        ? `LEARNED PREFERENCES: ${memory
            .slice(0, 8)
            .map((m) => m.patternName)
            .join(', ')}\n`
        : '';

    const prompt = `Evaluate this job posting for a Senior/Staff Backend Engineer (${yearsExperience} yrs experience; preferred stack: ${preferredStack.join(', ')}).
${userContext ? `USER RULES: ${userContext}\n` : ''}${strategy ? `STRATEGY: ${strategy}\n` : ''}${appliedSignal}${memorySignal}
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
1. STRICTLY REJECT (score 0-25, category "skip") any Engineering Manager, people-management, Frontend/Mobile-only, QA/Support, or junior (<5 yrs) roles.
2. PRIORITIZE pure Individual Contributor (IC) Backend / Distributed Systems roles (SDE-3, Senior SDE, Staff SDE, Lead SDE) at high-paying product, cloud, or fintech companies.
3. LOCATION RANKING: Boost Bangalore & Delhi-NCR (Noida/Gurgaon) highest (+10), then Remote India (+7), then Hyderabad & Pune (+5).
4. In "insights", explicitly list: (a) ATS Req ID & direct URL for referral outreach, and (b) Top 5-8 missing JD keywords to add to the candidate's LaTeX resume.

Respond with ONLY valid JSON:
{
  "relevanceScore": <0-100>,
  "interviewChance": <0-100>,
  "overallCategory": "auto-flag" | "maybe-flag" | "skip",
  "relevanceReasoning": "<concise 1-sentence fit & level assessment>",
  "insights": "Req ID: ${job.externalId} | Missing LaTeX keywords: <comma-separated keywords>",
  "matchedPatterns": ["<matched skill or signal>"]
}`;

    const text = await this.generateText(prompt, 750);
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
    const prompt = `Draft high-conversion referral outreach notes for ${input.title} at ${input.company}, grounded strictly in this redacted resume:
${resume}

Match Analysis: ${input.relevanceReasoning ?? ''}
Details & Req ID: ${input.insights ?? ''}
Focus Areas: ${focusPatterns.join(', ')}

Respond with ONLY valid JSON:
{
  "opening": "<LinkedIn connection/referral note under 280 characters including the exact Req ID if present>",
  "body": "<3 concise bullet points highlighting quantified distributed systems, backend scale, and tech stack fit from the resume>",
  "closing": "<2-sentence direct email/DM referral ask with clear call to action>"
}`;
    const text = await this.generateText(prompt, 750);
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

  async learnPatterns(
    analyses: JobAnalysis[],
    appliedJobs: { title: string; company: string }[] = [],
  ): Promise<PatternLearning> {
    const appliedCompanies = new Set(appliedJobs.map((a) => a.company.toLowerCase()));
    const skillCounts = new Map<string, number>();
    const gapCounts = new Map<string, number>();

    for (const a of analyses) {
      const weight = appliedCompanies.has((a as any).company?.toLowerCase?.() ?? '') ? 3 : a.relevance_score >= 75 ? 2 : 1;
      for (const p of a.matched_patterns ?? []) {
        skillCounts.set(p, (skillCounts.get(p) ?? 0) + weight);
      }
      if (a.relevance_score >= 70 && a.insights?.includes('Missing LaTeX keywords:')) {
        const rawGaps = a.insights.split('Missing LaTeX keywords:')[1] ?? '';
        for (const g of rawGaps.split(',').map((s) => s.trim()).filter((s) => s && s.length < 40)) {
          gapCounts.set(g, (gapCounts.get(g) ?? 0) + 1);
        }
      }
    }

    const topSkillsMatched = [...skillCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);

    const commonGaps = [...gapCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);

    return {
      topSkillsMatched: topSkillsMatched.length > 0 ? topSkillsMatched : ['Java', 'Distributed Systems', 'AWS', 'Microservices'],
      commonGaps,
      recommendedFocus: ['Distributed Systems', 'Java / Spring Boot', 'Event-Driven Architecture', 'Payment & Ledger Systems'],
      bestJobCategories: ['SDE-3 / Senior Backend IC', 'Staff Software Engineer'],
    };
  }
}
