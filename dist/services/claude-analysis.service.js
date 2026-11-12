"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeAnalysisService = void 0;
exports.extractRelevantSections = extractRelevantSections;
const gemini_retry_1 = require("../utils/gemini-retry");
const logger_1 = require("../utils/logger");
function extractJson(text) {
    const cleaned = text.replace(/```json|```/gi, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match)
        throw new Error('No JSON found in Gemini response');
    return JSON.parse(match[0]);
}
function extractRelevantSections(description, maxChars) {
    return (description ?? '').slice(0, maxChars).trim();
}
class ClaudeAnalysisService {
    constructor(apiKey, model, descMaxChars = 4000) {
        this.apiKey = apiKey;
        this.model = model;
        this.descMaxChars = descMaxChars;
        this.tokensInput = 0;
        this.tokensOutput = 0;
        this.tokensCacheCreation = 0;
        this.tokensCacheRead = 0;
    }
    getTokenUsage() {
        return {
            input: this.tokensInput,
            output: this.tokensOutput,
            cacheCreation: this.tokensCacheCreation,
            cacheRead: this.tokensCacheRead,
        };
    }
    resetTokenUsage() {
        this.tokensInput = 0;
        this.tokensOutput = 0;
        this.tokensCacheCreation = 0;
        this.tokensCacheRead = 0;
    }
    async generateText(prompt, maxTokens = 700) {
        const m = this.model || 'gemini-3.8-flash';
        const res = await (0, gemini_retry_1.callGeminiWithRetry)(this.apiKey, m, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: maxTokens,
                responseMimeType: 'application/json',
            },
        }, { timeout: 60000 });
        const usage = res.data?.usageMetadata ?? {};
        this.tokensInput += usage.promptTokenCount ?? 0;
        this.tokensOutput += usage.candidatesTokenCount ?? 0;
        return res.data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    }
    async analyzeJob(job, resume, yearsExperience, preferredStack, memory, appliedJobs, userContext, strategy) {
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
        const raw = extractJson(text);
        logger_1.logger.info(`Analyzed job: ${job.title} at ${job.company}`, {
            score: raw.relevanceScore,
            category: raw.overallCategory,
        });
        return {
            relevanceScore: raw.relevanceScore,
            interviewChance: raw.interviewChance,
            overallCategory: raw.overallCategory,
            relevanceReasoning: raw.relevanceReasoning,
            insights: raw.insights,
            matchedPatterns: raw.matchedPatterns ?? [],
        };
    }
    async generateCoverLetter(input, resume, focusPatterns = []) {
        const prompt = `Write a short warm-referral message and cover note for ${input.title} at ${input.company}, grounded in this resume:
${resume}
Fit: ${input.relevanceReasoning ?? ''} | Focus: ${focusPatterns.join(', ')}
Respond with ONLY valid JSON:
{ "opening": "<referral ping>", "body": "<impact summary>", "closing": "<call to action>" }`;
        const text = await this.generateText(prompt, 700);
        return extractJson(text);
    }
    async submitAnalysisBatch(..._args) {
        throw new Error('Batch mode disabled — using real-time Gemini Flash');
    }
    async checkBatchStatus(_batchId) {
        return 'ended';
    }
    async processBatchResults(_batchId) {
        return new Map();
    }
    async learnPatterns(analyses, _appliedJobs) {
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
exports.ClaudeAnalysisService = ClaudeAnalysisService;
//# sourceMappingURL=claude-analysis.service.js.map