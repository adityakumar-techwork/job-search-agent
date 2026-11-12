"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobRepository = void 0;
const client_1 = require("./client");
const logger_1 = require("../utils/logger");
class JobRepository {
    async saveJobs(jobs) {
        if (jobs.length === 0)
            return;
        const pool = (0, client_1.getPool)();
        for (const job of jobs) {
            try {
                await pool.query(`INSERT INTO jobs (
            source, external_id, title, company, description,
            location, location_category,
            salary_min, salary_max, salary_currency,
            apply_url, posted_at, is_active,
            recruiter_name, recruiter_email,
            company_hiring_url, company_size, company_website
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (source, external_id) DO NOTHING`, [
                    job.source,
                    job.externalId,
                    job.title,
                    job.company,
                    job.description,
                    job.location ?? null,
                    job.locationCategory ?? null,
                    job.salaryMin ?? null,
                    job.salaryMax ?? null,
                    job.salaryCurrency ?? null,
                    job.applyUrl,
                    job.postedAt ?? null,
                    job.isActive,
                    job.recruiterName ?? null,
                    job.recruiterEmail ?? null,
                    job.companyHiringUrl ?? null,
                    job.companySize ?? null,
                    job.companyWebsite ?? null,
                ]);
            }
            catch (err) {
                // 23505 = unique_violation — apply_url duplicate from a different source; expected, not an error
                if (err.code === '23505')
                    continue;
                // Any other failure (e.g. 22001 string_data_right_truncation from a malformed
                // upstream API field) should cost this one job, not the whole fetch batch.
                logger_1.logger.error('Failed to save job — skipping', {
                    source: job.source,
                    externalId: job.externalId,
                    title: job.title.slice(0, 80),
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }
    async getJobsSinceLastRun() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM jobs
       WHERE fetched_at > NOW() - INTERVAL '1 day'
       ORDER BY posted_at DESC`);
        return result.rows.map(mapRow);
    }
    // Returns jobs (with DB ids) whose apply_url is in the given list
    // AND that have no non-stale claude_analysis record yet.
    async getUnanalyzedJobs(applyUrls) {
        if (applyUrls.length === 0)
            return [];
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT j.* FROM jobs j
       LEFT JOIN claude_analysis ca ON ca.job_id = j.id AND ca.is_stale = FALSE
       WHERE j.apply_url = ANY($1)
       AND ca.id IS NULL
       ORDER BY j.posted_at DESC NULLS LAST`, [applyUrls]);
        return result.rows.map(mapRow);
    }
    async getJobsByIds(ids) {
        if (ids.length === 0)
            return [];
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM jobs WHERE id = ANY($1)`, [ids]);
        return result.rows.map(mapRow);
    }
    async getJobsByLocationCategory(category) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM jobs WHERE location_category = $1 ORDER BY posted_at DESC`, [category]);
        return result.rows.map(mapRow);
    }
}
exports.JobRepository = JobRepository;
function mapRow(row) {
    return {
        id: row.id,
        source: row.source,
        externalId: row.external_id,
        title: row.title,
        company: row.company,
        description: row.description,
        location: row.location,
        locationCategory: row.location_category,
        salaryMin: row.salary_min,
        salaryMax: row.salary_max,
        salaryCurrency: row.salary_currency,
        applyUrl: row.apply_url,
        postedAt: row.posted_at,
        fetchedAt: row.fetched_at,
        isActive: row.is_active,
        recruiterName: row.recruiter_name,
        recruiterEmail: row.recruiter_email,
        companyHiringUrl: row.company_hiring_url,
        companySize: row.company_size,
        companyWebsite: row.company_website,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
//# sourceMappingURL=job.repository.js.map