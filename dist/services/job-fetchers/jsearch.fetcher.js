"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSearchFetcher = void 0;
exports.capTerms = capTerms;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Cap a term list to `max` effective terms: keep the first `max - 1` distinct, then OR the
// remainder into one combined term. Bounds the query matrix regardless of how many titles or
// locations are configured. e.g. capTerms([A,B,C,D,E], 4) -> [A, B, C, "D OR E"].
function capTerms(terms, max) {
    const cleaned = terms.map((t) => t.trim()).filter(Boolean);
    if (cleaned.length <= max)
        return cleaned;
    return [...cleaned.slice(0, max - 1), cleaned.slice(max - 1).join(' OR ')];
}
class JSearchFetcher {
    constructor(apiKey, config) {
        this.apiKey = apiKey;
        this.config = config;
    }
    async fetch(criteria) {
        if (!this.isScheduledToday()) {
            logger_1.logger.info(`JSearch: not scheduled today (cadence: ${this.config.cadence.join(',')}) — skipping`);
            return [];
        }
        // Query matrix: capped titles × capped locations, one num_pages=1 request each.
        const titles = capTerms(criteria.jobTitles, 4);
        const locations = capTerms(this.config.locations, 3);
        const matrix = titles.flatMap((title) => locations.map((location) => ({ title, location })));
        if (matrix.length === 0) {
            logger_1.logger.warn('JSearch: empty query matrix (no job titles or no locations configured) — skipping');
            return [];
        }
        const raw = [];
        let issued = 0;
        let remaining = Infinity;
        for (const { title, location } of matrix.slice(0, this.config.maxRequestsPerRun)) {
            if (remaining < this.config.minReserve) {
                logger_1.logger.warn(`JSearch: quota low (${remaining} remaining) — skipping remaining queries`);
                break;
            }
            const result = await this.fetchOne(title, location, criteria);
            raw.push(...result.jobs);
            issued++;
            if (result.remaining !== undefined)
                remaining = result.remaining;
        }
        const valid = raw.filter((j) => j.externalId && j.applyUrl);
        logger_1.logger.info('JSearch fetch complete', {
            queriesIssued: issued,
            rawPostings: valid.length,
            requestsRemaining: remaining === Infinity ? 'unknown' : remaining,
        });
        return valid;
    }
    isScheduledToday() {
        const today = DAY_NAMES[new Date().getDay()];
        // Match on the 3-letter prefix so "mon", "Mon", and "monday" all work.
        return this.config.cadence.some((d) => d.trim().toLowerCase().slice(0, 3) === today);
    }
    // One JSearch request. Returns the parsed jobs and the remaining monthly quota (from the
    // response header) so the caller can stop before exhausting it.
    async fetchOne(title, location, criteria) {
        try {
            const response = await axios_1.default.get('https://jsearch.p.rapidapi.com/search-v2', {
                params: {
                    query: `${title} ${location}`.trim(),
                    job_title: title,
                    num_pages: '1',
                    date_posted: this.config.datePosted,
                    country: 'us',
                },
                headers: {
                    'X-RapidAPI-Key': this.apiKey,
                    'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
                },
                timeout: 45000,
            });
            const header = response.headers?.['x-ratelimit-requests-remaining'];
            const remaining = header !== undefined ? Number(header) : undefined;
            return { jobs: this.parseJobs(response.data, criteria), remaining };
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && err.response?.status === 429) {
                // Out of quota — signal the loop to stop rather than keep hammering.
                logger_1.logger.warn('JSearch: rate limit reached (429) — stopping');
                return { jobs: [], remaining: 0 };
            }
            logger_1.logger.error('JSearch: query failed', {
                query: `${title} ${location}`,
                error: err instanceof Error ? err.message : String(err),
            });
            return { jobs: [] };
        }
    }
    parseJobs(data, criteria) {
        // API returns data.data as an array (v1) or data.data.jobs as an array (v2)
        const payload = data?.data;
        const rawData = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.jobs)
                ? payload.jobs
                : [];
        return rawData.map((raw) => {
            const location = `${raw.job_country ?? ''} - ${raw.job_state ?? ''}`
                .trim()
                .replace(/^-\s*|-\s*$/, '')
                .trim();
            return {
                source: 'jsearch',
                externalId: String(raw.job_id ?? ''),
                title: String(raw.job_title ?? ''),
                company: String(raw.employer_name ?? ''),
                description: String(raw.job_description ?? ''),
                location,
                locationCategory: this.categorizeLocation(location, String(raw.job_title ?? ''), raw.job_is_remote === true, criteria.locationKeywords),
                salaryMin: raw.job_min_salary != null ? Number(raw.job_min_salary) : undefined,
                salaryMax: raw.job_max_salary != null ? Number(raw.job_max_salary) : undefined,
                salaryCurrency: raw.salary_currency != null ? String(raw.salary_currency) : undefined,
                applyUrl: String(raw.job_apply_link ?? ''),
                postedAt: raw.job_posted_at_datetime_utc
                    ? new Date(String(raw.job_posted_at_datetime_utc))
                    : undefined,
                isActive: true,
                recruiterName: raw.recruiter_name ? String(raw.recruiter_name) : undefined,
                recruiterEmail: raw.recruiter_email ? String(raw.recruiter_email) : undefined,
                companyHiringUrl: raw.company_hiring_url ? String(raw.company_hiring_url) : undefined,
                companySize: raw.company_size ? String(raw.company_size) : undefined,
                companyWebsite: raw.company_website ? String(raw.company_website) : undefined,
            };
        });
    }
    categorizeLocation(location, title, isRemoteFlag, locationKeywords) {
        const loc = (location ?? '').toLowerCase();
        const kw = locationKeywords ?? {
            remote: ['remote'],
            washington: ['bangalore-ncr', 'seattle', '- wa'],
            other: [],
        };
        // Remote is a work arrangement, not a place — check location, title, and the API's is_remote flag
        const remoteTarget = `${loc} ${title.toLowerCase()}`;
        if (isRemoteFlag || kw.remote.some((k) => remoteTarget.includes(k)))
            return 'remote';
        // Washington/other are geographic — only check location string
        if ([...kw.washington, ...['bangalore', 'bengaluru', 'karnataka', 'delhi', 'ncr', 'noida', 'gurgaon', 'gurugram', 'haryana', 'uttar pradesh']].some((k) => loc.includes(k)))
            return 'bangalore-ncr';
        if (kw.other.length > 0 && kw.other.some((k) => loc.includes(k)))
            return 'other';
        return 'other';
    }
}
exports.JSearchFetcher = JSearchFetcher;
//# sourceMappingURL=jsearch.fetcher.js.map