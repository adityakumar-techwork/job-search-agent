"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AngelListFetcher = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
// Wellfound (formerly AngelList) does not currently offer a public REST API.
// This fetcher gracefully returns [] when the endpoint is unavailable.
// The aggregator continues with the other 3 sources unaffected.
class AngelListFetcher {
    async fetch(criteria) {
        try {
            const response = await axios_1.default.get('https://api.wellfound.com/jobs', {
                params: {
                    keywords: criteria.jobTitles.join(','),
                    remote_ok: 'true',
                    limit: '50',
                },
                timeout: 15000,
            });
            const rawJobs = Array.isArray(response.data?.jobs)
                ? response.data.jobs
                : Array.isArray(response.data)
                    ? response.data
                    : [];
            const jobs = rawJobs
                .filter((raw) => raw.url || raw.applyUrl)
                .map((raw) => ({
                source: 'angelist',
                externalId: String(raw.id ?? ''),
                title: String(raw.title ?? ''),
                company: String(raw.company ?? raw.startup ?? 'Unknown'),
                description: String(raw.description ?? ''),
                location: String(raw.location ?? 'Remote'),
                salaryMin: raw.salary_min != null ? Number(raw.salary_min) : undefined,
                salaryMax: raw.salary_max != null ? Number(raw.salary_max) : undefined,
                applyUrl: String(raw.url ?? raw.applyUrl ?? ''),
                postedAt: raw.created_at ? new Date(String(raw.created_at)) : undefined,
                isActive: true,
            }));
            logger_1.logger.info(`AngelList: fetched ${jobs.length} jobs`);
            return jobs;
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err)) {
                if (err.response?.status === 401) {
                    logger_1.logger.warn('AngelList: API requires authentication — public API not available, skipping');
                }
                else if (err.response?.status === 404) {
                    logger_1.logger.warn('AngelList: API endpoint not found — skipping');
                }
                else {
                    logger_1.logger.error('AngelList: fetch failed', {
                        error: err.message,
                    });
                }
            }
            else {
                logger_1.logger.error('AngelList: fetch failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return [];
        }
    }
}
exports.AngelListFetcher = AngelListFetcher;
//# sourceMappingURL=angelist.fetcher.js.map