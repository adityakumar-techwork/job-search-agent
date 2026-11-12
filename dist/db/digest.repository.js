"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigestRepository = void 0;
const client_1 = require("./client");
class DigestRepository {
    async getWeeklyStats() {
        const pool = (0, client_1.getPool)();
        const [fetched, analyzed, applications] = await Promise.all([
            pool.query(`SELECT COUNT(*) FROM jobs WHERE fetched_at > NOW() - INTERVAL '7 days'`),
            pool.query(`SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE overall_category = 'auto-flag') AS auto_flag,
           COUNT(*) FILTER (WHERE overall_category = 'maybe-flag') AS maybe_flag
         FROM claude_analysis
         WHERE analyzed_at > NOW() - INTERVAL '7 days' AND is_stale = FALSE`),
            pool.query(`SELECT COUNT(*) FROM applications WHERE applied_at > NOW() - INTERVAL '7 days'`),
        ]);
        return {
            jobsFetched: parseInt(fetched.rows[0].count, 10),
            jobsAnalyzed: parseInt(analyzed.rows[0].total, 10),
            autoFlagged: parseInt(analyzed.rows[0].auto_flag, 10),
            maybeFlagged: parseInt(analyzed.rows[0].maybe_flag, 10),
            applicationsSubmitted: parseInt(applications.rows[0].count, 10),
        };
    }
    async getAutoFlaggedJobs() {
        return this.getJobsByCategory('auto-flag');
    }
    async getMaybeFlaggedJobs() {
        return this.getJobsByCategory('maybe-flag');
    }
    async getJobsByCategory(category) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT
         j.id AS job_id, j.title, j.company, j.location, j.location_category, j.apply_url,
         ca.relevance_score, ca.interview_chance, ca.overall_category,
         ca.relevance_reasoning, ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON ca.job_id = j.id
       WHERE ca.overall_category = $1
         AND ca.analyzed_at > NOW() - INTERVAL '7 days'
         AND ca.is_stale = FALSE
       ORDER BY ca.relevance_score DESC`, [category]);
        return result.rows.map((row) => ({
            jobId: row.job_id,
            title: row.title,
            company: row.company,
            location: row.location,
            locationCategory: row.location_category,
            applyUrl: row.apply_url,
            relevanceScore: parseFloat(row.relevance_score),
            interviewChance: parseFloat(row.interview_chance),
            overallCategory: row.overall_category,
            relevanceReasoning: row.relevance_reasoning,
            coverLetterDraft: row.cover_letter_draft,
            analyzedAt: row.analyzed_at,
        }));
    }
}
exports.DigestRepository = DigestRepository;
//# sourceMappingURL=digest.repository.js.map