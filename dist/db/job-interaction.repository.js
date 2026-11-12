"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobInteractionRepository = void 0;
const client_1 = require("./client");
class JobInteractionRepository {
    async setInteraction(jobId, type, active) {
        const pool = (0, client_1.getPool)();
        if (active) {
            await pool.query(`INSERT INTO job_interactions (job_id, interaction_type)
         VALUES ($1, $2)
         ON CONFLICT (job_id, interaction_type) DO NOTHING`, [jobId, type]);
        }
        else {
            await pool.query(`DELETE FROM job_interactions WHERE job_id = $1 AND interaction_type = $2`, [jobId, type]);
        }
    }
}
exports.JobInteractionRepository = JobInteractionRepository;
//# sourceMappingURL=job-interaction.repository.js.map