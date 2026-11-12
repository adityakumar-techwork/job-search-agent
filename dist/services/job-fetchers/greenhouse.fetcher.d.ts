import { Job, JobFetcher, SearchCriteria } from '../../types';
import { Company } from '../../config/companies.config';
export declare function titleMatches(title: string, jobTitles: string[]): boolean;
export declare function htmlToText(html: string): string;
export declare function isIndiaOrRemoteLocation(location?: string): boolean;
export declare class GreenhouseFetcher implements JobFetcher {
    private readonly companies;
    private readonly delayMs;
    private readonly _skipOnDays;
    constructor(companies: Company[], delayMs?: number, _skipOnDays?: string[]);
    fetch(criteria: SearchCriteria): Promise<Job[]>;
    private fetchBoard;
    private mapJob;
}
//# sourceMappingURL=greenhouse.fetcher.d.ts.map