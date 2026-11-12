import { ClaudeAnalysis, JobAnalysisResult } from '../types';
export declare class ClaudeAnalysisRepository {
    saveAnalysis(jobId: string, analysis: JobAnalysisResult, locationCategory: string, coverLetterDraft?: string): Promise<void>;
    updateCoverLetter(jobId: string, draft: string): Promise<void>;
    getAnalysesByCategory(category: string): Promise<ClaudeAnalysis[]>;
    getRecentAnalyses(limit?: number): Promise<ClaudeAnalysis[]>;
    getAnalysisByJobId(jobId: string): Promise<ClaudeAnalysis | null>;
}
export interface JobWithAnalysis {
    jobId: string;
    title: string;
    company: string;
    location?: string;
    locationCategory?: string;
    applyUrl: string;
    source: string;
    recruiterName?: string;
    recruiterEmail?: string;
    companyHiringUrl?: string;
    companySize?: string;
    companyWebsite?: string;
    relevanceScore: number;
    interviewChance: number;
    overallCategory: string;
    relevanceReasoning?: string;
    insights?: string;
    matchedPatterns?: string[];
    coverLetterDraft?: string;
    analyzedAt?: Date;
}
export interface AnalysisWithJob {
    job: {
        id: string;
        title: string;
        company: string;
        location?: string;
        locationCategory?: string;
        description?: string;
        applyUrl: string;
        source: string;
        recruiterName?: string;
        recruiterEmail?: string;
        companyHiringUrl?: string;
        companySize?: string;
        companyWebsite?: string;
    };
    analysis: {
        id: string;
        relevanceScore: number;
        interviewChance: number;
        overallCategory: string;
        relevanceReasoning?: string;
        insights?: string;
        matchedPatterns?: string[];
        coverLetterDraft?: string;
        analyzedAt?: Date;
    };
}
export interface JobDetailResult {
    job: AnalysisWithJob['job'] & {
        isSaved: boolean;
        isNotInterested: boolean;
    };
    analysis: AnalysisWithJob['analysis'] | null;
}
export interface RawJobWithOptionalAnalysis {
    id: string;
    title: string;
    company: string;
    location?: string;
    locationCategory?: string;
    applyUrl: string;
    source: string;
    postedAt?: Date;
    fetchedAt?: Date;
    isAnalyzed: boolean;
    relevanceScore?: number;
    interviewChance?: number;
    overallCategory?: string;
    analyzedAt?: Date;
    isSaved: boolean;
    isNotInterested: boolean;
}
export declare class ClaudeAnalysisQueryRepository {
    getJobsWithAnalysis(category: string): Promise<JobWithAnalysis[]>;
    getJobsByLocation(category: string): Promise<JobWithAnalysis[]>;
    getAllWithJobs(limit?: number, offset?: number): Promise<{
        rows: AnalysisWithJob[];
        total: number;
    }>;
    getAllJobs(limit?: number, offset?: number): Promise<{
        rows: RawJobWithOptionalAnalysis[];
        total: number;
    }>;
    getSavedJobs(limit?: number, offset?: number): Promise<{
        rows: RawJobWithOptionalAnalysis[];
        total: number;
    }>;
    getJobWithOptionalAnalysis(jobId: string): Promise<JobDetailResult | null>;
    getWithJob(jobId: string): Promise<AnalysisWithJob | null>;
}
//# sourceMappingURL=claude-analysis.repository.d.ts.map