export interface WeeklyStats {
    jobsFetched: number;
    jobsAnalyzed: number;
    autoFlagged: number;
    maybeFlagged: number;
    applicationsSubmitted: number;
}
export interface DigestJob {
    jobId: string;
    title: string;
    company: string;
    location?: string;
    locationCategory?: string;
    applyUrl: string;
    relevanceScore: number;
    interviewChance: number;
    overallCategory: string;
    relevanceReasoning?: string;
    coverLetterDraft?: string;
    analyzedAt: Date;
}
export declare class DigestRepository {
    getWeeklyStats(): Promise<WeeklyStats>;
    getAutoFlaggedJobs(): Promise<DigestJob[]>;
    getMaybeFlaggedJobs(): Promise<DigestJob[]>;
    private getJobsByCategory;
}
//# sourceMappingURL=digest.repository.d.ts.map