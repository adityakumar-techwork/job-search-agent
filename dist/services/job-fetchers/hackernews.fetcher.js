"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HackerNewsAlgoliaFetcher = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
class HackerNewsAlgoliaFetcher {
    async fetch(criteria) {
        try {
            const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 2592000;
            const response = await axios_1.default.get('https://hn.algolia.com/api/v1/search', {
                params: {
                    query: `job ${criteria.jobTitles[0] ?? 'software engineer'}`,
                    filters: 'type:job',
                    numericFilters: `created_at_i>${thirtyDaysAgo}`,
                    hitsPerPage: 50,
                },
                timeout: 15000,
            });
            const jobs = (response.data?.hits ?? [])
                .filter((raw) => raw.url && typeof raw.url === 'string')
                .map((raw) => ({
                source: 'hackernews',
                externalId: String(raw.objectID ?? ''),
                title: String(raw.title ?? ''),
                company: extractCompanyFromTitle(String(raw.title ?? '')),
                description: String(raw.text ?? ''),
                location: 'Remote',
                applyUrl: String(raw.url ?? ''),
                postedAt: raw.created_at ? new Date(String(raw.created_at)) : undefined,
                isActive: true,
            }));
            logger_1.logger.info(`HackerNews: fetched ${jobs.length} jobs`);
            return jobs;
        }
        catch (err) {
            logger_1.logger.error('HackerNews: fetch failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
    }
}
exports.HackerNewsAlgoliaFetcher = HackerNewsAlgoliaFetcher;
// HN titles: "Company (YC S24) is hiring..." or "Company is hiring..."
function extractCompanyFromTitle(title) {
    const match = title.match(/^([^(|]+?)(?:\s*\(|\s+is\s)/i);
    return match ? match[1].trim() : 'Unknown';
}
//# sourceMappingURL=hackernews.fetcher.js.map