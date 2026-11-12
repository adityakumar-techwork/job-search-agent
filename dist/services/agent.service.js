"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousAgent = void 0;
const application_repository_1 = require("../db/application.repository");
const context_1 = require("../agent/context");
const logger_1 = require("../utils/logger");
// Context breakdown per daily run:
// - Resume: 3K tokens (loaded once at startup, reused across all job analyses)
// - Agent memory: 5K tokens (learned patterns, fresh daily from DB)
// - Jobs to analyze: 50K tokens (40-50 job descriptions)
// - Total: 58K input tokens
// - Available: 200K context window
// - Safety margin: 150K (never exceed)
// - Cost: ~$0.26/day, ~$7.80/month
// Claude uses full context (resume, memory, strategy) to reason about each job.
// No hardcoded rules like "if relevance_score > 75 then auto-flag".
// Claude decides. Agent learns and improves over time.
function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match)
        throw new Error('No JSON object found in Claude response');
    return JSON.parse(match[0]);
}
class AutonomousAgent {
    constructor(config, resumeRepository, agentMemoryRepository, claudeService, tokenBudget, jobAggregator, claudeAnalysisService, claudeAnalysisRepository, jobRepository, agentRunRepository, batchRunRepository) {
        this.config = config;
        this.resumeRepository = resumeRepository;
        this.agentMemoryRepository = agentMemoryRepository;
        this.claudeService = claudeService;
        this.tokenBudget = tokenBudget;
        this.jobAggregator = jobAggregator;
        this.claudeAnalysisService = claudeAnalysisService;
        this.claudeAnalysisRepository = claudeAnalysisRepository;
        this.jobRepository = jobRepository;
        this.agentRunRepository = agentRunRepository;
        this.batchRunRepository = batchRunRepository;
    }
    async runDailyLoop() {
        const runId = await this.agentRunRepository?.startRun();
        try {
            // Step 1: OBSERVE — load resume, memory, recent applications
            const context = await this.observe();
            logger_1.logger.info('Observed context', { resumeHash: context.resume.hash });
            // Step 2: ASSESS — Claude reasons about today's strategy
            const strategy = await this.assess(context);
            context.currentStrategy = strategy;
            logger_1.logger.info('Agent assessed strategy', { strategy: strategy.slice(0, 120) });
            // Step 3: FETCH — get new jobs
            const fetched = await this.fetchJobs();
            logger_1.logger.info(`Fetched ${fetched.length} jobs from APIs`);
            // Step 3a: FILTER — skip jobs already analyzed (avoids re-spending Claude tokens)
            const newJobs = await this.filterUnanalyzed(fetched);
            logger_1.logger.info(`New (unanalyzed) jobs: ${newJobs.length}/${fetched.length}`);
            // Step 3b: SELECT — apply per-location caps before analysis
            const jobs = this.selectJobsForAnalysis(newJobs);
            context.jobsToAnalyze = jobs;
            logger_1.logger.info(`Selected ${jobs.length}/${newJobs.length} jobs for analysis`);
            // Step 4: VALIDATE TOKEN BUDGET — using real data, immediately before any Claude spend
            if (!this.tokenBudget.validateForAnalysis(context.resume.redactedText, context.memory, jobs)) {
                logger_1.logger.error('Token budget exceeded. Aborting agent run.');
                if (runId)
                    await this.agentRunRepository?.failRun(runId, 'Token budget exceeded');
                return;
            }
            if (this.config.useBatchApi) {
                if (jobs.length === 0) {
                    logger_1.logger.info('No new jobs to analyze — skipping batch submission');
                    if (runId) {
                        const assessTokens = this.claudeService.getTokenUsage();
                        await this.agentRunRepository?.completeRun(runId, {
                            jobsFetched: fetched.length,
                            jobsAnalyzed: 0,
                            autoFlagged: 0,
                            maybeFlagged: 0,
                            skipped: 0,
                            patternsUpserted: 0,
                            tokensInput: assessTokens.input,
                            tokensOutput: assessTokens.output,
                            tokensCacheCreation: 0,
                            tokensCacheRead: 0,
                        });
                    }
                    return;
                }
                // Step 5 (BATCH): Submit all jobs to Anthropic Message Batches API and exit.
                // The poll-batch script will collect results, learn patterns, and complete the run.
                await this.submitBatch(jobs, context, runId, fetched.length);
                if (runId) {
                    const assessTokens = this.claudeService.getTokenUsage();
                    await this.agentRunRepository?.recordAssessTokens(runId, assessTokens.input, assessTokens.output);
                }
                logger_1.logger.info('Batch submitted — agent exiting. Poller will complete this run.');
                return;
            }
            // Step 5: ANALYZE — Claude scores each job against the full context
            const analyses = await this.analyzeJobs(jobs, context);
            context.analyses = analyses;
            logger_1.logger.info(`Analyzed ${analyses.length} jobs`);
            // Step 6: LEARN — Claude identifies patterns from today's results
            const patterns = await this.learnPatterns(analyses, jobs, context.appliedJobs);
            logger_1.logger.info(`Identified ${patterns.length} patterns`);
            // Step 7: STORE — persist results to DB
            await this.agentMemoryRepository.upsertAll(patterns);
            if (runId) {
                const claudeTokens = this.claudeService.getTokenUsage();
                const analysisTokens = this.claudeAnalysisService?.getTokenUsage() ?? { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
                await this.agentRunRepository?.completeRun(runId, {
                    jobsFetched: fetched.length,
                    jobsAnalyzed: analyses.length,
                    autoFlagged: analyses.filter((a) => a.overall_category === 'auto-flag').length,
                    maybeFlagged: analyses.filter((a) => a.overall_category === 'maybe-flag').length,
                    skipped: analyses.filter((a) => a.overall_category === 'skip').length,
                    patternsUpserted: patterns.length,
                    tokensInput: claudeTokens.input + analysisTokens.input,
                    tokensOutput: claudeTokens.output + analysisTokens.output,
                    tokensCacheCreation: analysisTokens.cacheCreation,
                    tokensCacheRead: analysisTokens.cacheRead,
                });
                const totalCacheTokens = analysisTokens.cacheCreation + analysisTokens.cacheRead;
                const cacheHitRate = totalCacheTokens > 0
                    ? Math.round((analysisTokens.cacheRead / totalCacheTokens) * 100)
                    : 0;
                logger_1.logger.info('Token usage for this run', {
                    input: claudeTokens.input + analysisTokens.input,
                    output: claudeTokens.output + analysisTokens.output,
                    cacheCreationTokens: analysisTokens.cacheCreation,
                    cacheReadTokens: analysisTokens.cacheRead,
                    cacheActivated: analysisTokens.cacheRead > 0,
                    cacheHitRate: `${cacheHitRate}%`,
                });
            }
            logger_1.logger.info('Agent run complete');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (runId)
                await this.agentRunRepository?.failRun(runId, message);
            throw err;
        }
    }
    async observe() {
        const resume = context_1.agentContext.resume ?? (await this.loadResumeFromDb());
        const memory = await this.agentMemoryRepository.getAll();
        const appRepo = new application_repository_1.ApplicationRepository();
        const appliedJobs = await appRepo.getRecentApplications(30).catch(() => []);
        return {
            resume,
            memory,
            appliedJobs: appliedJobs.map((a) => ({ title: a.title, company: a.company, location: a.location ?? undefined })),
            currentStrategy: '',
            jobsToAnalyze: [],
            analyses: [],
        };
    }
    async assess(context) {
        const { metadata } = context.resume;
        const memoryLines = context.memory.length > 0
            ? context.memory
                .map((p) => `- ${p.patternName}: confidence ${p.confidenceScore.toFixed(2)}`)
                .join('\n')
            : '- No patterns learned yet (first run)';
        const userContextSection = this.config.userContext
            ? `\nUSER CONTEXT (explicit, highest priority):\n${this.config.userContext}\n`
            : '';
        const yearsExp = metadata.yearsExperience ?? this.config.yearsExperience;
        const prompt = `You are an autonomous job search agent.
${userContextSection}
USER PROFILE:
${yearsExp} years experience
Technologies: ${(metadata.technologies ?? []).join(', ')}
Companies: ${(metadata.companies ?? []).join(', ')}
Preferred titles: ${this.config.jobTitles.join(', ')}
Location priority: ${this.config.locationPriority.join(', ')}

LEARNED PATTERNS:
${memoryLines}

What is your strategy for today's job analysis?
Consider: What patterns are strongest? What locations should we prioritize? What companies look promising?
Be concise (2-3 sentences).`;
        return this.claudeService.call(prompt);
    }
    async fetchJobs() {
        if (!this.jobAggregator) {
            logger_1.logger.info('No job aggregator configured — returning empty list');
            return [];
        }
        const criteria = {
            jobTitles: this.config.jobTitles,
            locationPriority: this.config.locationPriority,
            yearsExperience: this.config.yearsExperience,
            preferredStack: this.config.preferredTechnicalStack,
            locationKeywords: this.config.locationKeywords,
        };
        return this.jobAggregator.fetchAndStoreJobs(criteria);
    }
    async filterUnanalyzed(jobs) {
        if (!this.jobRepository || jobs.length === 0)
            return jobs;
        const applyUrls = jobs.map((j) => j.applyUrl).filter(Boolean);
        const unanalyzed = await this.jobRepository.getUnanalyzedJobs(applyUrls);
        const unanalyzedUrls = new Set(unanalyzed.map((j) => j.applyUrl));
        // Return the DB records (which have ids) for unanalyzed jobs,
        // preserving the order from the original fetch.
        return unanalyzed.filter((j) => unanalyzedUrls.has(j.applyUrl));
    }
    selectJobsForAnalysis(jobs) {
        const caps = this.tokenBudget.locationCaps(this.config.locationPriority);
        if (caps.size === 0)
            return jobs.slice(0, this.tokenBudget.maxJobsPerRun);
        // Cap any single source at 70% of the run only when the pool actually mixes sources (e.g. if
        // the lane schedules ever overlap). On a single-lane day the one source takes the full budget.
        const distinctSources = new Set(jobs.map((j) => j.source)).size;
        const maxPerSource = distinctSources > 1 ? Math.ceil(this.tokenBudget.maxJobsPerRun * 0.7) : Infinity;
        // Pass 1: fill each location up to its cap, respecting the per-source cap; overflow is
        // redistributed in pass 2 (where the source cap is relaxed so budget isn't wasted).
        const counts = new Map();
        const sourceCounts = new Map();
        const selected = [];
        const overflow = [];
        for (const job of jobs) {
            if (selected.length >= this.tokenBudget.maxJobsPerRun)
                break;
            const loc = job.locationCategory ?? 'other';
            const cap = caps.get(loc);
            // A location left out of LOCATION_PRIORITY entirely is excluded outright — it must never be
            // analyzed, even to use up leftover budget in pass 2. (A configured location with a cap of 0
            // from rounding is different: it still goes to overflow, since pass 2 may legitimately fill it.)
            if (cap === undefined)
                continue;
            const count = counts.get(loc) ?? 0;
            const srcCount = sourceCounts.get(job.source) ?? 0;
            if (count < cap && srcCount < maxPerSource) {
                selected.push(job);
                counts.set(loc, count + 1);
                sourceCounts.set(job.source, srcCount + 1);
            }
            else {
                overflow.push(job);
            }
        }
        logger_1.logger.info('Location caps for this run', Object.fromEntries(counts));
        logger_1.logger.info('Source mix for this run', Object.fromEntries(sourceCounts));
        // Pass 2: redistribute unused budget — fill remaining slots from overflow in priority order
        if (selected.length < this.tokenBudget.maxJobsPerRun && overflow.length > 0) {
            const remaining = this.tokenBudget.maxJobsPerRun - selected.length;
            const priorityIndex = (cat) => {
                const idx = this.config.locationPriority.indexOf(cat ?? 'other');
                return idx === -1 ? this.config.locationPriority.length : idx;
            };
            overflow.sort((a, b) => priorityIndex(a.locationCategory) - priorityIndex(b.locationCategory));
            const extras = overflow.slice(0, remaining);
            selected.push(...extras);
            logger_1.logger.info(`Redistributed ${extras.length} overflow jobs to fill unused budget`);
        }
        return selected;
    }
    async submitBatch(jobs, context, runId, jobsFetched) {
        if (!this.claudeAnalysisService || !this.batchRunRepository) {
            throw new Error('Batch mode requires claudeAnalysisService and batchRunRepository');
        }
        const batchId = await this.claudeAnalysisService.submitAnalysisBatch(jobs, context.resume.redactedText, context.resume.metadata.yearsExperience ?? this.config.yearsExperience, this.config.preferredTechnicalStack, context.memory, context.appliedJobs, this.config.userContext || undefined, context.currentStrategy || undefined);
        await this.batchRunRepository.createBatchRun(batchId, jobs.map((j) => j.id), jobsFetched, runId);
        logger_1.logger.info('Batch run recorded', { batchId, jobCount: jobs.length, runId });
    }
    async analyzeJobs(jobs, context) {
        const analyses = [];
        for (const job of jobs) {
            try {
                let analysis;
                if (this.claudeAnalysisService) {
                    const result = await this.claudeAnalysisService.analyzeJob(job, context.resume.redactedText, context.resume.metadata.yearsExperience ?? this.config.yearsExperience, this.config.preferredTechnicalStack, context.memory, context.appliedJobs, this.config.userContext || undefined, context.currentStrategy || undefined);
                    // Cover letters are generated on demand (POST /api/analyses/:jobId/cover-letter),
                    // not during the run — most are never used.
                    if (this.claudeAnalysisRepository && job.id) {
                        await this.claudeAnalysisRepository.saveAnalysis(job.id, result, job.locationCategory ?? 'other');
                    }
                    analysis = {
                        job_id: job.id ?? '',
                        company: job.company,
                        relevance_score: result.relevanceScore,
                        interview_chance: result.interviewChance,
                        location_category: job.locationCategory ?? 'other',
                        overall_category: result.overallCategory,
                        relevance_reasoning: result.relevanceReasoning,
                        insights: result.insights,
                        matched_patterns: result.matchedPatterns,
                        cover_letter_draft: undefined,
                    };
                }
                else {
                    analysis = await this.analyzeJob(job, context);
                }
                analyses.push(analysis);
                if (analyses.length % 10 === 0) {
                    logger_1.logger.info(`Analyzed ${analyses.length}/${jobs.length} jobs`);
                }
            }
            catch (err) {
                logger_1.logger.error(`Failed to analyze job ${job.id ?? job.title} — skipping`, {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return analyses;
    }
    async analyzeJob(job, context) {
        const memoryLines = context.memory.length > 0
            ? context.memory.map((p) => `- ${p.patternName}: ${p.confidenceScore.toFixed(2)}`).join('\n')
            : '- None yet';
        const userContextSection = this.config.userContext
            ? `\nUSER CONTEXT (explicit, highest priority):\n${this.config.userContext}\n`
            : '';
        const prompt = `You are an autonomous job search agent.
${userContextSection}
USER PROFILE (redacted — no PII):
${context.resume.redactedText}

LEARNED PATTERNS:
${memoryLines}

TODAY'S STRATEGY:
${context.currentStrategy}

JOB TO ANALYZE:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
Description: ${job.description}

Score this job on:
1. Relevance to the user's profile (0-100)
2. Likelihood of interview if they apply (0-100)
3. Does it match any learned patterns?
4. If relevance_score > 75, draft a short (3-5 sentence) cover letter opener

Respond with ONLY valid JSON (no markdown):
{
  "relevance_score": <number 0-100>,
  "interview_chance": <number 0-100>,
  "location_category": ${this.config.locationPriority.map((l) => `"${l}"`).join(' | ')},
  "overall_category": "auto-flag" | "needs-review" | "skip",
  "relevance_reasoning": "<one sentence>",
  "insights": "<one sentence>",
  "matched_patterns": ["<pattern name>"],
  "cover_letter_draft": "<optional, only if relevance_score > 75>"
}`;
        const text = await this.claudeService.call(prompt);
        const raw = extractJson(text);
        return {
            job_id: job.id ?? '',
            company: job.company,
            relevance_score: raw.relevance_score,
            interview_chance: raw.interview_chance,
            location_category: raw.location_category ?? job.locationCategory ?? 'other',
            overall_category: raw.overall_category,
            relevance_reasoning: raw.relevance_reasoning,
            insights: raw.insights,
            matched_patterns: raw.matched_patterns ?? [],
            cover_letter_draft: raw.cover_letter_draft,
        };
    }
    async learnPatterns(analyses, jobs, appliedJobs = []) {
        if (analyses.length === 0) {
            logger_1.logger.info('No analyses to learn from — skipping pattern learning');
            return [];
        }
        if (appliedJobs.length > 0) {
            logger_1.logger.info(`Including ${appliedJobs.length} user-applied jobs as learning signal`);
        }
        if (this.claudeAnalysisService) {
            try {
                const learning = await this.claudeAnalysisService.learnPatterns(analyses, appliedJobs);
                logger_1.logger.info('Pattern learning complete', {
                    topSkills: learning.topSkillsMatched,
                    focus: learning.recommendedFocus,
                });
                const successRate = analyses.filter((a) => a.overall_category !== 'skip').length / analyses.length;
                return learning.recommendedFocus.map((focus) => ({
                    patternName: `focus_${focus.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
                    patternType: 'tech_preference',
                    patternData: {
                        topSkills: learning.topSkillsMatched,
                        gaps: learning.commonGaps,
                        categories: learning.bestJobCategories,
                    },
                    confidenceScore: Math.min(0.4 + successRate * 0.4, 0.8),
                    observationCount: analyses.length,
                }));
            }
            catch (err) {
                logger_1.logger.error('ClaudeAnalysisService.learnPatterns failed — falling back to default', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        const highValueLines = analyses
            .filter((a) => a.relevance_score >= 75)
            .map((a) => `- ${a.company}: patterns=[${a.matched_patterns.join(', ')}] score=${a.relevance_score}`)
            .join('\n');
        const appliedLines = appliedJobs.length > 0
            ? appliedJobs.map((j) => `- ${j.title} at ${j.company}`).join('\n')
            : '- None yet';
        const prompt = `You analyzed ${analyses.length} jobs today.

USER-APPLIED JOBS (strongest signal — confirmed user intent):
${appliedLines}

HIGH-VALUE JOBS (relevance ≥ 75):
${highValueLines || '- None found today'}

ALL RESULTS SUMMARY:
- Auto-flagged: ${analyses.filter((a) => a.overall_category === 'auto-flag').length}
- Needs review: ${analyses.filter((a) => a.overall_category === 'needs-review').length}
- Skipped: ${analyses.filter((a) => a.overall_category === 'skip').length}

What patterns do you observe? Weight user-applied jobs most heavily.
- Did certain companies appear multiple times with high scores?
- Did certain technologies dominate high-value jobs?
- Is there a location trend?

For each pattern, estimate confidence (0.0-1.0) based on evidence strength.
Respond with ONLY valid JSON (no markdown):
{
  "patterns": [
    {
      "name": "<snake_case_pattern_name>",
      "type": "company_success" | "tech_preference" | "location_trend" | "industry_fit",
      "confidence": <number 0.0-1.0>,
      "observation_count": <number>
    }
  ]
}`;
        const text = await this.claudeService.call(prompt);
        const raw = extractJson(text);
        return (raw.patterns ?? []).map((p) => ({
            patternName: p.name,
            patternType: p.type,
            patternData: {},
            confidenceScore: Math.min(Math.max(p.confidence, 0), 1),
            observationCount: p.observation_count ?? 1,
        }));
    }
    async loadResumeFromDb() {
        const meta = await this.resumeRepository.getResumeMetadata();
        if (!meta)
            throw new Error('No resume found in DB — run startup first');
        return {
            redactedText: meta.resumeRedacted,
            hash: meta.resumeHash,
            metadata: meta,
        };
    }
}
exports.AutonomousAgent = AutonomousAgent;
//# sourceMappingURL=agent.service.js.map