import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { Company } from '../../config/companies.config';
import { logger } from '../../utils/logger';

const ENGINEERING_KEYWORDS = ['engineer', 'developer', 'software', 'programmer', 'architect'];

const EXCLUDE_TITLE: RegExp[] = [
  /front[\s-]?end/,
  /\b(mobile|ios|android)\b/,
  /\b(engineering\s+manager|manager|director|vp|head\s+of)\b/,
  /\b(intern|apprentice|associate|junior)\b/,
  /\b(engineer|swe|sde)\s+(ii|i|1|2)\b/,
  /\b(field|solutions?|sales)\s+engineer\b/,
];

export function titleMatches(title: string, jobTitles: string[]): boolean {
  const t = title.toLowerCase();
  if (EXCLUDE_TITLE.some((re) => re.test(t))) return false;
  if (ENGINEERING_KEYWORDS.some((k) => t.includes(k))) return true;
  if (/\b(sde|swe)\b/.test(t)) return true;
  return jobTitles.some((jt) => {
    const q = jt.trim().toLowerCase();
    return q.length > 0 && t.includes(q);
  });
}

export function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&/g, '&')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section|header)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/ | /gi, ' ')
    .replace(/'|’|‘|’|‘/g, "'")
    .replace(/"|“|”|“|”/g, '"')
    .replace(/–|—|–|—/g, '-')
    .replace(/&/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const INDIA_SIGNAL = /\b(india|bangalore|bengaluru|delhi|ncr|noida|gurgaon|gurugram|hyderabad|pune|mumbai|chennai|remote[\s-]*india)\b/i;

export function isIndiaOrRemoteLocation(location?: string): boolean {
  if (!location) return false;
  return INDIA_SIGNAL.test(location);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GreenhouseFetcher implements JobFetcher {
  constructor(
    private readonly companies: Company[],
    private readonly delayMs = 250,
    private readonly _skipOnDays: string[] = [],
  ) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    const boards = this.companies.filter((c) => c.provider === 'greenhouse' && c.slug.trim());
    if (boards.length === 0) return [];

    const all: Job[] = [];
    for (let i = 0; i < boards.length; i++) {
      all.push(...(await this.fetchBoard(boards[i], criteria)));
      if (i < boards.length - 1 && this.delayMs > 0) await sleep(this.delayMs);
    }
    logger.info('Greenhouse fetch complete', { boards: boards.length, jobs: all.length });
    return all;
  }

  private async fetchBoard(company: Company, criteria: SearchCriteria): Promise<Job[]> {
    try {
      const response = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`,
        { params: { content: 'true' }, timeout: 20000 },
      );

      const rawJobs: Record<string, unknown>[] = Array.isArray(response.data?.jobs)
        ? (response.data.jobs as Record<string, unknown>[])
        : [];
      const jobs = rawJobs
        .filter((raw) => titleMatches(String(raw.title ?? ''), criteria.jobTitles))
        .map((raw) => this.mapJob(raw, company))
        .filter((job) => isIndiaOrRemoteLocation(job.location));

      logger.info(`Greenhouse: ${company.name} → ${jobs.length} India IC roles of ${rawJobs.length}`);
      return jobs;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) {
        logger.warn(`Greenhouse: board not found for "${company.name}" (${company.slug})`);
      } else {
        logger.error(`Greenhouse: fetch failed for "${company.name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return [];
    }
  }

  private mapJob(raw: Record<string, unknown>, company: Company): Job {
    const location = (raw.location as { name?: string } | undefined)?.name;
    return {
      source: 'greenhouse',
      externalId: String(raw.id ?? ''),
      title: String(raw.title ?? ''),
      company: company.name,
      description: htmlToText(String(raw.content ?? '')),
      location: location ?? undefined,
      applyUrl: String(raw.absolute_url ?? ''),
      postedAt: raw.updated_at ? new Date(String(raw.updated_at)) : undefined,
      isActive: true,
    };
  }
}
