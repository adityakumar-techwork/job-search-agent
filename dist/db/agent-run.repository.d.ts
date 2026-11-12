export interface AgentRunMetrics {
    jobsFetched: number;
    jobsAnalyzed: number;
    autoFlagged: number;
    maybeFlagged: number;
    skipped: number;
    patternsUpserted: number;
    tokensInput: number;
    tokensOutput: number;
    tokensCacheCreation: number;
    tokensCacheRead: number;
}
export interface AgentRun {
    id: string;
    status: 'running' | 'completed' | 'failed';
    startedAt: Date;
    completedAt?: Date;
    durationSeconds?: number;
    jobsFetched: number;
    jobsAnalyzed: number;
    autoFlagged: number;
    maybeFlagged: number;
    skipped: number;
    patternsUpserted: number;
    tokensInput: number;
    tokensOutput: number;
    tokensCacheCreation: number;
    tokensCacheRead: number;
    errorMessage?: string;
    createdAt: Date;
}
export declare class AgentRunRepository {
    startRun(): Promise<string>;
    completeRun(id: string, metrics: AgentRunMetrics): Promise<void>;
    recordAssessTokens(id: string, tokensInput: number, tokensOutput: number): Promise<void>;
    failRun(id: string, errorMessage: string): Promise<void>;
    getRecentRuns(limit?: number): Promise<AgentRun[]>;
}
//# sourceMappingURL=agent-run.repository.d.ts.map