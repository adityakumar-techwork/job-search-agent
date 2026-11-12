import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { Company } from '../../config/companies.config';
import { logger } from '../../utils/logger';
import { titleMatches, htmlToText, isIndiaOrRemoteLocation } from './greenhouse.fetcher';

export class AshbyFetcher implements JobFetcher {
  constructor(private readonly companies: Company[]) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    const boards = this.companies.filter((c) => c.provider === 'ashby' && c.slug.trim());
    if (boards.length === 0) return [];

    const all: Job[] = [];
    for (const company of boards) {
      try {
        const res = await axios.get(
          `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`,
          { timeout: 20000 },
        );
        const rawJobs: Record<string, unknown>[] = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
        const matched = rawJobs
          .filter((raw) => titleMatches(String(raw.title ?? ''), criteria.jobTitles))
          .map((raw) => {
            const locParts = [
              raw.location,
              Array.isArray(raw.secondaryLocations)
                ? raw.secondaryLocations
                    .map((s: Record<string, unknown>) => String(s.location ?? ''))
                    .filter(Boolean)
                    .join(', ')
                : '',
            ].filter(Boolean);
            const location = locParts.join(' | ');
            const desc =
              String(raw.descriptionPlain ?? '').trim() ||
              htmlToText(String(raw.descriptionHtml ?? ''));

            return {
              source: 'ashby',
              externalId: String(raw.id ?? ''),
              title: String(raw.title ?? ''),
              company: company.name,
              description: desc,
              location,
              applyUrl: String(raw.jobUrl ?? raw.applyUrl ?? ''),
              postedAt: typeof raw.publishedAt === 'string' ? new Date(raw.publishedAt) : undefined,
              isActive: raw.isListed !== false,
            } as Job;
          })
          .filter((job) => isIndiaOrRemoteLocation(job.location));

        logger.info(`Ashby: ${company.name} → ${matched.length} India IC roles of ${rawJobs.length}`);
        all.push(...matched);
      } catch (err) {
        logger.warn(`Ashby: fetch skipped for "${company.name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return all;
  }
}
