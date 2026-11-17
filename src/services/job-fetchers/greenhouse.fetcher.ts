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

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-', hellip: '...', bull: '•',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code)) return m;
      if (code === 160) return ' ';
      if (code === 8216 || code === 8217) return "'";
      if (code === 8220 || code === 8221) return '"';
      if (code === 8211 || code === 8212) return '-';
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? m;
  });
}

// Greenhouse's `content` field is HTML that is itself entity-escaped (&lt;p&gt;...), so decode
// once to get real tags, strip the tags, then decode the text-level entities that remain.
export function htmlToText(html: string): string {
  if (!html) return '';
  const unescaped = html.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&amp;/gi, '&');
  const stripped = unescaped
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section|header)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Boards list every geo; keep roles located in India (or remote roles open to India / APAC).
const INDIA_SIGNAL = /\b(india|bangalore|bengaluru|delhi|ncr|noida|gurgaon|gurugram|hyderabad|pune|mumbai|chennai|remote[\s-]*(?:india|apac|asia))\b/i;

export function isIndiaOrRemoteLocation(location?: string): boolean {
  if (!location) return false;
  return INDIA_SIGNAL.test(location);
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GreenhouseFetcher implements JobFetcher {
  constructor(
    private readonly companies: Company[],
    private readonly delayMs = 250,
    // Weekdays (sun..sat) on which Greenhouse stands down so another lane gets the analysis budget.
    private readonly skipOnDays: string[] = [],
  ) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    const today = DAY_NAMES[new Date().getDay()];
    if (this.skipOnDays.some((d) => d.trim().toLowerCase().slice(0, 3) === today)) {
      logger.info(`Greenhouse: ${today} is a reserved day — skipping`);
      return [];
    }

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
