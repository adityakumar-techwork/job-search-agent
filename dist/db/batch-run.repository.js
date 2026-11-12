"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchRunRepository = void 0;
const client_1 = require("./client");
const logger_1 = require("../utils/logger");
class BatchRunRepository {
    async createBatchRun(batchId, jobIds, jobsFetched, runId) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`INSERT INTO batch_runs (batch_id, job_ids, jobs_fetched, run_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`, [batchId, jobIds, jobsFetched, runId ?? null]);
        return result.rows[0].id;
    }
    async getPendingBatches() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM batch_runs WHERE status = 'pending' ORDER BY submitted_at ASC`);
        return result.rows.map(mapRow);
    }
    async completeBatch(id) {
        const pool = (0, client_1.getPool)();
        await pool.query(`UPDATE batch_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`, [id]);
    }
    async failBatch(id, errorMessage) {
        const pool = (0, client_1.getPool)();
        await pool.query(`UPDATE batch_runs
       SET status = 'failed', completed_at = NOW(), error_message = $2
       WHERE id = $1`, [id, errorMessage]);
    }
    // Anthropic expires batches after 24h. Atomically fail stale batch_runs rows
    // and their linked agent_runs so nothing stays stuck as 'running' indefinitely.
    async failStaleBatches() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`WITH expired AS (
         UPDATE batch_runs
         SET status = 'failed',
             completed_at = NOW(),
             error_message = 'Batch expired — Anthropic 24h window elapsed'
         WHERE status = 'pending'
           AND submitted_at < NOW() - INTERVAL '25 hours'
         RETURNING id, run_id
       ),
       failed_runs AS (
         UPDATE agent_runs
         SET status = 'failed',
             completed_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
             error_message = 'Batch expired — Anthropic 24h window elapsed'
         WHERE id IN (SELECT run_id FROM expired WHERE run_id IS NOT NULL)
       )
       SELECT COUNT(*) AS batch_count FROM expired`);
        const count = parseInt(result.rows[0]?.batch_count ?? '0', 10);
        if (count > 0) {
            logger_1.logger.warn(`Marked ${count} stale batch(es) and their agent runs as failed`);
        }
    }
}
exports.BatchRunRepository = BatchRunRepository;
function mapRow(row) {
    return {
        id: row.id,
        batchId: row.batch_id,
        status: row.status,
        jobIds: row.job_ids,
        jobsFetched: row.jobs_fetched,
        runId: row.run_id,
        submittedAt: row.submitted_at,
        completedAt: row.completed_at,
        errorMessage: row.error_message,
    };
}
//# sourceMappingURL=batch-run.repository.js.map