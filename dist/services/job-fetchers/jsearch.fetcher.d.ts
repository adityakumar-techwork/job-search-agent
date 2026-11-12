import { Job, JobFetcher, SearchCriteria } from '../../types';
import { JSearchConfig } from '../../config/jsearch.config';
export declare function capTerms(terms: string[], max: number): string[];
export declare class JSearchFetcher implements JobFetcher {
    private readonly apiKey;
    private readonly config;
    constructor(apiKey: string, config: JSearchConfig);
    fetch(criteria: SearchCriteria): Promise<Job[]>;
    private isScheduledToday;
    private fetchOne;
    private parseJobs;
    private categorizeLocation;
}
//# sourceMappingURL=jsearch.fetcher.d.ts.map