import { Job, JobAnalysis, JobAnalysisResult, CoverLetterResult, PatternLearning, AgentMemory } from '../types';
export interface BatchJobResult {
    analysis: JobAnalysisResult;
}
export declare function extractRelevantSections(description: string, maxChars: number): string;
export declare class ClaudeAnalysisService {
    private readonly apiKey;
    private readonly model;
    private readonly descMaxChars;
    private tokensInput;
    private tokensOutput;
    private tokensCacheCreation;
    private tokensCacheRead;
    constructor(apiKey: string, model: string, descMaxChars?: number);
    getTokenUsage(): {
        input: number;
        output: number;
        cacheCreation: number;
        cacheRead: number;
    };
    resetTokenUsage(): void;
    private generateText;
    analyzeJob(job: Job, resume: string, yearsExperience: number, preferredStack: string[], memory: AgentMemory[], appliedJobs: {
        title: string;
        company: string;
        location?: string;
    }[], userContext?: string, strategy?: string): Promise<JobAnalysisResult>;
    generateCoverLetter(input: {
        title: string;
        company: string;
        relevanceReasoning?: string;
        insights?: string;
    }, resume: string, focusPatterns?: string[]): Promise<CoverLetterResult>;
    submitAnalysisBatch(..._args: unknown[]): Promise<string>;
    checkBatchStatus(_batchId?: string): Promise<'in_progress' | 'ended'>;
    processBatchResults(_batchId?: string): Promise<Map<string, BatchJobResult>>;
    learnPatterns(analyses: JobAnalysis[], _appliedJobs?: unknown[]): Promise<PatternLearning>;
}
//# sourceMappingURL=claude-analysis.service.d.ts.map