"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config/config");
const client_1 = require("./db/client");
const batch_run_repository_1 = require("./db/batch-run.repository");
const job_repository_1 = require("./db/job.repository");
const claude_analysis_repository_1 = require("./db/claude-analysis.repository");
const agent_memory_repository_1 = require("./db/agent-memory.repository");
const agent_run_repository_1 = require("./db/agent-run.repository");
const application_repository_1 = require("./db/application.repository");
const claude_analysis_service_1 = require("./services/claude-analysis.service");
const logger_1 = require("./utils/logger");
async function processBatch(batchRun, claudeAnalysisService, jobRepository, claudeAnalysisRepository, agentMemoryRepository, agentRunRepository, batchRunRepository, appRepository) {
    // 1. Check if Anthropic has finished processing
    const status = await claudeAnalysisService.checkBatchStatus(batchRun.batchId);
    if (status !== 'ended') {
        logger_1.logger.info(`Batch still in progress — skipping`, { batchId: batchRun.batchId });
        return;
    }
    logger_1.logger.info(`Batch complete — processing results`, { batchId: batchRun.batchId });
    // 2. Fetch job records to get location_category and company name
    const jobs = await jobRepository.getJobsByIds(batchRun.jobIds);
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    // 3. Parse results from Anthropic and save analyses to DB in parallel
    const resultMap = await claudeAnalysisService.processBatchResults(batchRun.batchId);
    const saveResults = await Promise.all(Array.from(resultMap.entries()).map(async ([jobId, { analysis }]) => {
        const job = jobMap.get(jobId);
        if (!job) {
            logger_1.logger.warn(`Job ${jobId} not found in DB — skipping analysis save`);
            return null;
        }
        // Cover letters are generated on demand (POST /api/analyses/:jobId/cover-letter),
        // not during batch processing — most are never used.
        try {
            await claudeAnalysisRepository.saveAnalysis(jobId, analysis, job.locationCategory ?? 'other');
        }
        catch (err) {
            logger_1.logger.error(`Failed to save analysis for job ${jobId} — skipping`, {
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
        return {
            job_id: jobId,
            company: job.company,
            relevance_score: analysis.relevanceScore,
            interview_chance: analysis.interviewChance,
            location_category: job.locationCategory ?? 'other',
            overall_category: analysis.overallCategory,
            relevance_reasoning: analysis.relevanceReasoning,
            insights: analysis.insights,
            matched_patterns: analysis.matchedPatterns,
            cover_letter_draft: undefined,
        };
    }));
    const analyses = saveResults.filter((r) => r !== null);
    logger_1.logger.info(`Saved ${analyses.length}/${resultMap.size} analyses to DB`);
    // 4. Learn patterns from the batch results (single Claude call)
    let patternsUpserted = 0;
    if (analyses.length > 0) {
        const appliedJobs = await appRepository.getRecentApplications(30).catch(() => []);
        try {
            const learning = await claudeAnalysisService.learnPatterns(analyses, appliedJobs);
            const successRate = analyses.filter((a) => a.overall_category !== 'skip').length / analyses.length;
            const patterns = learning.recommendedFocus.map((focus) => ({
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
            await agentMemoryRepository.upsertAll(patterns);
            patternsUpserted = patterns.length;
            logger_1.logger.info(`Pattern learning complete`, { patterns: patternsUpserted });
        }
        catch (err) {
            logger_1.logger.warn('Pattern learning failed — skipping', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    // 5. Complete the agent run with final metrics
    if (batchRun.runId) {
        const tokenUsage = claudeAnalysisService.getTokenUsage();
        await agentRunRepository.completeRun(batchRun.runId, {
            jobsFetched: batchRun.jobsFetched,
            jobsAnalyzed: analyses.length,
            autoFlagged: analyses.filter((a) => a.overall_category === 'auto-flag').length,
            maybeFlagged: analyses.filter((a) => a.overall_category === 'maybe-flag').length,
            skipped: analyses.filter((a) => a.overall_category === 'skip').length,
            patternsUpserted,
            tokensInput: tokenUsage.input,
            tokensOutput: tokenUsage.output,
            tokensCacheCreation: tokenUsage.cacheCreation,
            tokensCacheRead: tokenUsage.cacheRead,
        });
        const totalCacheTokens = tokenUsage.cacheCreation + tokenUsage.cacheRead;
        const cacheHitRate = totalCacheTokens > 0
            ? Math.round((tokenUsage.cacheRead / totalCacheTokens) * 100)
            : 0;
        logger_1.logger.info('Agent run completed', {
            runId: batchRun.runId,
            cacheCreationTokens: tokenUsage.cacheCreation,
            cacheReadTokens: tokenUsage.cacheRead,
            cacheActivated: tokenUsage.cacheRead > 0,
            cacheHitRate: `${cacheHitRate}%`,
        });
    }
    // 6. Mark batch as done
    await batchRunRepository.completeBatch(batchRun.id);
}
async function main() {
    const config = (0, config_1.validateAndLoadConfig)();
    await (0, client_1.testConnection)();
    const batchRunRepository = new batch_run_repository_1.BatchRunRepository();
    // Auto-fail batches that have been pending beyond Anthropic's 24h expiry window
    await batchRunRepository.failStaleBatches();
    const pending = await batchRunRepository.getPendingBatches();
    if (pending.length === 0) {
        logger_1.logger.info('No pending batches — exiting');
        return;
    }
    logger_1.logger.info(`Found ${pending.length} pending batch(es)`);
    const claudeAnalysisService = new claude_analysis_service_1.ClaudeAnalysisService(config.claudeApiKey, config.claudeModel, config.analysisDescMaxChars);
    const jobRepository = new job_repository_1.JobRepository();
    const claudeAnalysisRepository = new claude_analysis_repository_1.ClaudeAnalysisRepository();
    const agentMemoryRepository = new agent_memory_repository_1.AgentMemoryRepository();
    const agentRunRepository = new agent_run_repository_1.AgentRunRepository();
    const appRepository = new application_repository_1.ApplicationRepository();
    for (const batchRun of pending) {
        claudeAnalysisService.resetTokenUsage();
        try {
            await processBatch(batchRun, claudeAnalysisService, jobRepository, claudeAnalysisRepository, agentMemoryRepository, agentRunRepository, batchRunRepository, appRepository);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.error(`Failed to process batch ${batchRun.batchId}`, { error: message });
            await batchRunRepository.failBatch(batchRun.id, message);
            if (batchRun.runId) {
                await agentRunRepository.failRun(batchRun.runId, `Batch processing failed: ${message}`);
            }
        }
    }
}
main()
    .catch((err) => {
    logger_1.logger.error('Poll-batch failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
})
    .finally(() => (0, client_1.closePool)());
//# sourceMappingURL=poll-batch.js.map