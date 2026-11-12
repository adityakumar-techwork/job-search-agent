import { Job, JobFetcher, SearchCriteria } from '../../types';
import { Company } from '../../config/companies.config';
export declare class LeverFetcher implements JobFetcher {
    private readonly companies;
    constructor(companies: Company[]);
    fetch(criteria: SearchCriteria): Promise<Job[]>;
}
//# sourceMappingURL=lever.fetcher.d.ts.map