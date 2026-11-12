import { Config, Job, AgentMemory, JobAnalysis, RunningAgentContext } from '../types';
import { ClaudeService } from './claude.service';
import { TokenBudgetService } from './token-budget.service';
import { JobAggregatorService } from './job-aggregator.service';
import { ClaudeAnalysisService } from './claude-analysis.service';
import { ResumeRepository } from '../db/resume.repository';
import { AgentMemoryRepository } from '../db/agent-memory.repository';
import { JobRepository } from '../db/job.repository';
import { ClaudeAnalysisRepository } from '../db/claude-analysis.repository';
import { AgentRunRepository } from '../db/agent-run.repository';
import { BatchRunRepository } from '../db/batch-run.repository';
export declare class AutonomousAgent {
    private readonly config;
    private readonly resumeRepository;
    private readonly agentMemoryRepository;
    private readonly claudeService;
    private readonly tokenBudget;
    private readonly jobAggregator?;
    private readonly claudeAnalysisService?;
    private readonly claudeAnalysisRepository?;
    private readonly jobRepository?;
    private readonly agentRunRepository?;
    private readonly batchRunRepository?;
    constructor(config: Config, resumeRepository: ResumeRepository, agentMemoryRepository: AgentMemoryRepository, claudeService: ClaudeService, tokenBudget: TokenBudgetService, jobAggregator?: JobAggregatorService | undefined, claudeAnalysisService?: ClaudeAnalysisService | undefined, claudeAnalysisRepository?: ClaudeAnalysisRepository | undefined, jobRepository?: JobRepository | undefined, agentRunRepository?: AgentRunRepository | undefined, batchRunRepository?: BatchRunRepository | undefined);
    runDailyLoop(): Promise<void>;
    observe(): Promise<RunningAgentContext>;
    assess(context: RunningAgentContext): Promise<string>;
    fetchJobs(): Promise<Job[]>;
    filterUnanalyzed(jobs: Job[]): Promise<Job[]>;
    selectJobsForAnalysis(jobs: Job[]): Job[];
    private submitBatch;
    analyzeJobs(jobs: Job[], context: RunningAgentContext): Promise<JobAnalysis[]>;
    analyzeJob(job: Job, context: RunningAgentContext): Promise<JobAnalysis>;
    learnPatterns(analyses: JobAnalysis[], jobs: Job[], appliedJobs?: {
        title: string;
        company: string;
        location?: string;
    }[]): Promise<Pick<AgentMemory, 'patternName' | 'patternType' | 'patternData' | 'confidenceScore' | 'observationCount'>[]>;
    private loadResumeFromDb;
}
//# sourceMappingURL=agent.service.d.ts.map