import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { Company } from '../../config/companies.config';
import { logger } from '../../utils/logger';
import { titleMatches, htmlToText, isIndiaOrRemoteLocation } from './greenhouse.fetcher';

export class LeverFetcher implements JobFetcher {
  constructor(private readonly companies: Company[]) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    const boards = this.companies.filter((c) => c.provider === 'lever' && c.slug.trim());
    if (boards.length === 0) return [];

    const all: Job[] = [];
    for (const company of boards) {
      try {
        const res = await axios.get(`https://api.lever.co/v0/postings/${company.slug}?mode=json`, {
          timeout: 20000,
        });
        const rawJobs: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
        const matched = rawJobs
          .filter((raw) => titleMatches(String(raw.text ?? ''), criteria.jobTitles))
          .map((raw) => {
            const categories = (raw.categories as { location?: string } | undefined) ?? {};
            const desc =
              [raw.descriptionPlain, raw.additionalPlain].filter(Boolean).join('\n\n') ||
              htmlToText(String(raw.description ?? ''));
            return {
              source: 'lever',
              externalId: String(raw.id ?? ''),
              title: String(raw.text ?? ''),
              company: company.name,
              description: desc,
              location: categories.location,
              applyUrl: String(raw.hostedUrl ?? ''),
              postedAt: typeof raw.createdAt === 'number' ? new Date(raw.createdAt) : undefined,
              isActive: true,
            } as Job;
          })
          .filter((job) => isIndiaOrRemoteLocation(job.location));

        logger.info(`Lever: ${company.name} → ${matched.length} India IC roles of ${rawJobs.length}`);
        all.push(...matched);
      } catch (err) {
        logger.warn(`Lever: fetch skipped for "${company.name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return all;
  }
}
