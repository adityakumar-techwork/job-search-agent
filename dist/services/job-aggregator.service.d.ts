import { Job, JobFetcher, LocationKeywords, SearchCriteria } from '../types';
import { JobRepository } from '../db/job.repository';
export declare class JobAggregatorService {
    private readonly fetchers;
    private readonly jobRepository;
    constructor(fetchers: JobFetcher[], jobRepository: JobRepository);
    fetchAndStoreJobs(criteria: SearchCriteria): Promise<Job[]>;
    private preferredRecord;
    categorizeLocation(location?: string, locationKeywords?: LocationKeywords): string;
}
//# sourceMappingURL=job-aggregator.service.d.ts.map