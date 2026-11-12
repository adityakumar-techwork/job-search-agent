import { Job, AgentMemory } from '../types';
export declare class TokenBudgetService {
    private readonly maxContextTokens;
    private readonly safetyMargin;
    readonly maxJobsPerRun = 30;
    validateForAnalysis(resumeText: string, memory: AgentMemory[], jobs: Job[]): boolean;
    locationCaps(locationPriority: string[]): Map<string, number>;
}
//# sourceMappingURL=token-budget.service.d.ts.map