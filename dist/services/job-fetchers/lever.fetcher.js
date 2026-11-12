"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeverFetcher = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
const greenhouse_fetcher_1 = require("./greenhouse.fetcher");
class LeverFetcher {
    constructor(companies) {
        this.companies = companies;
    }
    async fetch(criteria) {
        const boards = this.companies.filter((c) => c.provider === 'lever' && c.slug.trim());
        if (boards.length === 0)
            return [];
        const all = [];
        for (const company of boards) {
            try {
                const res = await axios_1.default.get(`https://api.lever.co/v0/postings/${company.slug}?mode=json`, {
                    timeout: 20000,
                });
                const rawJobs = Array.isArray(res.data) ? res.data : [];
                const matched = rawJobs
                    .filter((raw) => (0, greenhouse_fetcher_1.titleMatches)(String(raw.text ?? ''), criteria.jobTitles))
                    .map((raw) => {
                    const categories = raw.categories ?? {};
                    const desc = [raw.descriptionPlain, raw.additionalPlain].filter(Boolean).join('\n\n') ||
                        (0, greenhouse_fetcher_1.htmlToText)(String(raw.description ?? ''));
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
                    };
                })
                    .filter((job) => (0, greenhouse_fetcher_1.isIndiaOrRemoteLocation)(job.location));
                logger_1.logger.info(`Lever: ${company.name} → ${matched.length} India IC roles of ${rawJobs.length}`);
                all.push(...matched);
            }
            catch (err) {
                logger_1.logger.warn(`Lever: fetch skipped for "${company.name}"`, {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return all;
    }
}
exports.LeverFetcher = LeverFetcher;
//# sourceMappingURL=lever.fetcher.js.map