import { validateAndLoadConfig } from './config/config';
import { logger } from './utils/logger';
import { getPool, testConnection, closePool } from './db/client';
import { ResumeService } from './services/resume.service';
import { ResumeChangeDetectionService } from './services/resume-change.service';
import { TokenBudgetService } from './services/token-budget.service';
import { ClaudeService } from './services/claude.service';
import { AutonomousAgent } from './services/agent.service';
import { JobAggregatorService } from './services/job-aggregator.service';
import { ClaudeAnalysisService } from './services/claude-analysis.service';
import { JSearchFetcher } from './services/job-fetchers/jsearch.fetcher';
import { GreenhouseFetcher } from './services/job-fetchers/greenhouse.fetcher';
import { LeverFetcher } from './services/job-fetchers/lever.fetcher';
import { AshbyFetcher } from './services/job-fetchers/ashby.fetcher';
import { loadJSearchConfig } from './config/jsearch.config';
import { loadCompanies } from './config/companies.config';
import { ResumeRepository } from './db/resume.repository';
import { AgentMemoryRepository } from './db/agent-memory.repository';
import { JobRepository } from './db/job.repository';
import { ClaudeAnalysisRepository } from './db/claude-analysis.repository';
import { AgentRunRepository } from './db/agent-run.repository';
import { agentContext } from './agent/context';
import { JobFetcher } from './types';

async function main(): Promise<void> {
  logger.info('Agent run starting');

  const config = validateAndLoadConfig();
  getPool();
  await testConnection();
  logger.info('Database connected');

  const resumeService = new ResumeService({
    enabled: config.enablePiiRedaction,
    additionalPatterns: config.additionalRedactionPatterns,
  });
  const resumeRepository = new ResumeRepository();
  const changeService = new ResumeChangeDetectionService(resumeRepository);

  const { redactedText, hash, metadata } = await resumeService.loadAndRedact({
    path: config.resumePath || undefined,
    base64: config.resumeBase64,
  });

  const { changed, action } = await changeService.detectChange(hash, metadata);
  if (changed) {
    if (action === 'reset_memory') {
      await resumeRepository.resetAgentMemory();
      logger.info('Major resume change — agent memory reset');
    } else {
      await resumeRepository.decayPatternConfidence(0.8);
      logger.info('Minor resume change — pattern confidence decayed');
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

  agentContext.resume = { redactedText, hash, metadata };
  logger.info('Resume loaded and redacted');

  const agentMemoryRepository = new AgentMemoryRepository();
  const jobRepository = new JobRepository();
  const tokenBudget = new TokenBudgetService();
  const llmOpts = { fallbackModels: config.llmFallbackModels, minIntervalMs: config.llmMinIntervalMs };
  const claudeService = new ClaudeService(config.llmApiKey, config.llmModel, config.llmMaxTokens, llmOpts);
  const jsearchConfig = loadJSearchConfig();
  const companies = loadCompanies();
  const fetchers: JobFetcher[] = [
    new GreenhouseFetcher(companies, 250, []),
    new LeverFetcher(companies),
    new AshbyFetcher(companies),
  ];
  if (config.rapidApiKey) {
    fetchers.unshift(new JSearchFetcher(config.rapidApiKey, jsearchConfig));
  } else {
    logger.warn('RAPIDAPI_KEY not set — skipping JSearch, using company ATS boards only');
  }
  const jobAggregator = new JobAggregatorService(fetchers, jobRepository);
  const claudeAnalysisService = new ClaudeAnalysisService(config.llmApiKey, config.llmModel, config.analysisDescMaxChars, {
    ...llmOpts,
    profile: {
      jobTitles: config.jobTitles,
      locationPriority: config.locationPriority,
      preferredCompanyStage: config.preferredCompanyStage,
    },
  });
  const claudeAnalysisRepository = new ClaudeAnalysisRepository();
  const agentRunRepository = new AgentRunRepository();

  const agent = new AutonomousAgent(
    config,
    resumeRepository,
    agentMemoryRepository,
    claudeService,
    tokenBudget,
    jobAggregator,
    claudeAnalysisService,
    claudeAnalysisRepository,
    jobRepository,
    agentRunRepository,
  );

  await agent.runDailyLoop();
  logger.info('Agent run complete');
}

main()
  .catch((err) => {
    logger.error('Agent run failed', { error: err instanceof Error ? err.message : String(err) });
    // exitCode (not process.exit) so the finally() below still closes the pool and flushes logs.
    process.exitCode = 1;
  })
  .finally(() => closePool());
