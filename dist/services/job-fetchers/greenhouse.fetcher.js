"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreenhouseFetcher = void 0;
exports.titleMatches = titleMatches;
exports.htmlToText = htmlToText;
exports.isIndiaOrRemoteLocation = isIndiaOrRemoteLocation;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
const ENGINEERING_KEYWORDS = ['engineer', 'developer', 'software', 'programmer', 'architect'];
const EXCLUDE_TITLE = [
    /front[\s-]?end/,
    /\b(mobile|ios|android)\b/,
    /\b(engineering\s+manager|manager|director|vp|head\s+of)\b/,
    /\b(intern|apprentice|associate|junior)\b/,
    /\b(engineer|swe|sde)\s+(ii|i|1|2)\b/,
    /\b(field|solutions?|sales)\s+engineer\b/,
];
function titleMatches(title, jobTitles) {
    const t = title.toLowerCase();
    if (EXCLUDE_TITLE.some((re) => re.test(t)))
        return false;
    if (ENGINEERING_KEYWORDS.some((k) => t.includes(k)))
        return true;
    if (/\b(sde|swe)\b/.test(t))
        return true;
    return jobTitles.some((jt) => {
        const q = jt.trim().toLowerCase();
        return q.length > 0 && t.includes(q);
    });
}
function htmlToText(html) {
    if (!html)
        return '';
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
function isIndiaOrRemoteLocation(location) {
    if (!location)
        return false;
    return INDIA_SIGNAL.test(location);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
class GreenhouseFetcher {
    constructor(companies, delayMs = 250, _skipOnDays = []) {
        this.companies = companies;
        this.delayMs = delayMs;
        this._skipOnDays = _skipOnDays;
    }
    async fetch(criteria) {
        const boards = this.companies.filter((c) => c.provider === 'greenhouse' && c.slug.trim());
        if (boards.length === 0)
            return [];
        const all = [];
        for (let i = 0; i < boards.length; i++) {
            all.push(...(await this.fetchBoard(boards[i], criteria)));
            if (i < boards.length - 1 && this.delayMs > 0)
                await sleep(this.delayMs);
        }
        logger_1.logger.info('Greenhouse fetch complete', { boards: boards.length, jobs: all.length });
        return all;
    }
    async fetchBoard(company, criteria) {
        try {
            const response = await axios_1.default.get(`https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`, { params: { content: 'true' }, timeout: 20000 });
            const rawJobs = Array.isArray(response.data?.jobs)
                ? response.data.jobs
                : [];
            const jobs = rawJobs
                .filter((raw) => titleMatches(String(raw.title ?? ''), criteria.jobTitles))
                .map((raw) => this.mapJob(raw, company))
                .filter((job) => isIndiaOrRemoteLocation(job.location));
            logger_1.logger.info(`Greenhouse: ${company.name} → ${jobs.length} India IC roles of ${rawJobs.length}`);
            return jobs;
        }
        catch (err) {
            const status = axios_1.default.isAxiosError(err) ? err.response?.status : undefined;
            if (status === 404) {
                logger_1.logger.warn(`Greenhouse: board not found for "${company.name}" (${company.slug})`);
            }
            else {
                logger_1.logger.error(`Greenhouse: fetch failed for "${company.name}"`, {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return [];
        }
    }
    mapJob(raw, company) {
        const location = raw.location?.name;
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
exports.GreenhouseFetcher = GreenhouseFetcher;
//# sourceMappingURL=greenhouse.fetcher.js.map