"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationRepository = void 0;
const client_1 = require("./client");
class ApplicationRepository {
    async recordApplication(jobId) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`INSERT INTO applications (job_id)
       VALUES ($1)
       ON CONFLICT (job_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING *`, [jobId]);
        return mapRow(result.rows[0]);
    }
    async getApplications() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT
         a.id, a.job_id, a.applied_at, a.status, a.created_at, a.updated_at,
         j.title, j.company, j.location, j.apply_url
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       ORDER BY a.applied_at DESC`);
        return result.rows.map(mapRowWithJob);
    }
    async getRecentApplications(limit = 30) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT
         a.id, a.job_id, a.applied_at, a.status, a.created_at, a.updated_at,
         j.title, j.company, j.location, j.apply_url
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       ORDER BY a.applied_at DESC
       LIMIT $1`, [limit]);
        return result.rows.map(mapRowWithJob);
    }
    async updateApplicationStatus(jobId, status) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`UPDATE applications
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE job_id = $2
       RETURNING *`, [status, jobId]);
        return result.rows[0] ? mapRow(result.rows[0]) : null;
    }
}
exports.ApplicationRepository = ApplicationRepository;
function mapRow(row) {
    return {
        id: row.id,
        jobId: row.job_id,
        appliedAt: row.applied_at,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapRowWithJob(row) {
    return {
        id: row.id,
        jobId: row.job_id,
        appliedAt: row.applied_at,
        status: row.status,
        title: row.title,
        company: row.company,
        location: row.location,
        applyUrl: row.apply_url,
    };
}
//# sourceMappingURL=application.repository.js.map