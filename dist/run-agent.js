"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config/config");
const logger_1 = require("./utils/logger");
const client_1 = require("./db/client");
const resume_service_1 = require("./services/resume.service");
const resume_change_service_1 = require("./services/resume-change.service");
const token_budget_service_1 = require("./services/token-budget.service");
const claude_service_1 = require("./services/claude.service");
const agent_service_1 = require("./services/agent.service");
const job_aggregator_service_1 = require("./services/job-aggregator.service");
const claude_analysis_service_1 = require("./services/claude-analysis.service");
const jsearch_fetcher_1 = require("./services/job-fetchers/jsearch.fetcher");
const greenhouse_fetcher_1 = require("./services/job-fetchers/greenhouse.fetcher");
const lever_fetcher_1 = require("./services/job-fetchers/lever.fetcher");
const jsearch_config_1 = require("./config/jsearch.config");
const companies_config_1 = require("./config/companies.config");
const resume_repository_1 = require("./db/resume.repository");
const agent_memory_repository_1 = require("./db/agent-memory.repository");
const job_repository_1 = require("./db/job.repository");
const claude_analysis_repository_1 = require("./db/claude-analysis.repository");
const agent_run_repository_1 = require("./db/agent-run.repository");
const batch_run_repository_1 = require("./db/batch-run.repository");
const context_1 = require("./agent/context");
async function main() {
    logger_1.logger.info('Agent run starting');
    const config = (0, config_1.validateAndLoadConfig)();
    (0, client_1.getPool)();
    await (0, client_1.testConnection)();
    logger_1.logger.info('Database connected');
    const resumeService = new resume_service_1.ResumeService();
    const resumeRepository = new resume_repository_1.ResumeRepository();
    const changeService = new resume_change_service_1.ResumeChangeDetectionService(resumeRepository);
    const { redactedText, hash, metadata } = await resumeService.loadAndRedact(config.resumePath);
    const { changed, action } = await changeService.detectChange(hash, metadata);
    if (changed) {
        if (action === 'reset_memory') {
            await resumeRepository.resetAgentMemory();
            logger_1.logger.info('Major resume change — agent memory reset');
        }
        else {
            await resumeRepository.decayPatternConfidence(0.8);
            logger_1.logger.info('Minor resume change — pattern confidence decayed');
        }
        await resumeRepository.markAnalysisStale();
    }
    await resumeRepository.saveResumeMetadata({
        resume_hash: hash,
        resume_redacted: redactedText,
        years_experience: metadata.yearsExperience,
        technologies: metadata.technologies,
        companies: metadata.companies,
        education_level: metadata.educationLevel,
        certifications: metadata.certifications,
        soft_skills: metadata.softSkills,
    });
    context_1.agentContext.resume = { redactedText, hash, metadata };
    logger_1.logger.info('Resume loaded and redacted');
    const agentMemoryRepository = new agent_memory_repository_1.AgentMemoryRepository();
    const jobRepository = new job_repository_1.JobRepository();
    const tokenBudget = new token_budget_service_1.TokenBudgetService();
    const claudeService = new claude_service_1.ClaudeService(config.claudeApiKey, config.claudeModel, config.claudeMaxTokens);
    const jsearchConfig = (0, jsearch_config_1.loadJSearchConfig)();
    const jobAggregator = new job_aggregator_service_1.JobAggregatorService([
        new jsearch_fetcher_1.JSearchFetcher(config.rapidApiKey, jsearchConfig),
        // Greenhouse runs on the days JSearch does not, so each lane gets the full analysis budget.
        new greenhouse_fetcher_1.GreenhouseFetcher((0, companies_config_1.loadCompanies)(), 250, []),
        new lever_fetcher_1.LeverFetcher((0, companies_config_1.loadCompanies)()),
    ], jobRepository);
    const claudeAnalysisService = new claude_analysis_service_1.ClaudeAnalysisService(config.claudeApiKey, config.claudeModel, config.analysisDescMaxChars);
    const claudeAnalysisRepository = new claude_analysis_repository_1.ClaudeAnalysisRepository();
    const agentRunRepository = new agent_run_repository_1.AgentRunRepository();
    const batchRunRepository = new batch_run_repository_1.BatchRunRepository();
    const agent = new agent_service_1.AutonomousAgent(config, resumeRepository, agentMemoryRepository, claudeService, tokenBudget, jobAggregator, claudeAnalysisService, claudeAnalysisRepository, jobRepository, agentRunRepository, batchRunRepository);
    await agent.runDailyLoop();
    logger_1.logger.info('Agent run complete');
}
main()
    .catch((err) => {
    logger_1.logger.error('Agent run failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
})
    .finally(() => (0, client_1.closePool)());
//# sourceMappingURL=run-agent.js.map