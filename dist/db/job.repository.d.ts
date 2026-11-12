import { Job } from '../types';
export declare class JobRepository {
    saveJobs(jobs: Job[]): Promise<void>;
    getJobsSinceLastRun(): Promise<Job[]>;
    getUnanalyzedJobs(applyUrls: string[]): Promise<Job[]>;
    getJobsByIds(ids: string[]): Promise<Job[]>;
    getJobsByLocationCategory(category: string): Promise<Job[]>;
}
//# sourceMappingURL=job.repository.d.ts.map