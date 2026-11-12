"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunRepository = void 0;
const client_1 = require("./client");
class AgentRunRepository {
    async startRun() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`INSERT INTO agent_runs (status, started_at) VALUES ('running', NOW()) RETURNING id`);
        return result.rows[0].id;
    }
    async completeRun(id, metrics) {
        const pool = (0, client_1.getPool)();
        await pool.query(`UPDATE agent_runs
       SET status = 'completed',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
           jobs_fetched = $2,
           jobs_analyzed = $3,
           auto_flagged = $4,
           maybe_flagged = $5,
           skipped = $6,
           patterns_upserted = $7,
           tokens_input = tokens_input + $8,
           tokens_output = tokens_output + $9,
           tokens_cache_creation = tokens_cache_creation + $10,
           tokens_cache_read = tokens_cache_read + $11
       WHERE id = $1`, [
            id,
            metrics.jobsFetched,
            metrics.jobsAnalyzed,
            metrics.autoFlagged,
            metrics.maybeFlagged,
            metrics.skipped,
            metrics.patternsUpserted,
            metrics.tokensInput,
            metrics.tokensOutput,
            metrics.tokensCacheCreation,
            metrics.tokensCacheRead,
        ]);
    }
    async recordAssessTokens(id, tokensInput, tokensOutput) {
        const pool = (0, client_1.getPool)();
        await pool.query(`UPDATE agent_runs
       SET tokens_input = tokens_input + $2,
           tokens_output = tokens_output + $3
       WHERE id = $1`, [id, tokensInput, tokensOutput]);
    }
    async failRun(id, errorMessage) {
        const pool = (0, client_1.getPool)();
        await pool.query(`UPDATE agent_runs
       SET status = 'failed',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
           error_message = $2
       WHERE id = $1`, [id, errorMessage]);
    }
    async getRecentRuns(limit = 30) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT $1`, [limit]);
        return result.rows.map((r) => ({
            id: r.id,
            status: r.status,
            startedAt: r.started_at,
            completedAt: r.completed_at ?? undefined,
            durationSeconds: r.duration_seconds ?? undefined,
            jobsFetched: r.jobs_fetched,
            jobsAnalyzed: r.jobs_analyzed,
            autoFlagged: r.auto_flagged,
            maybeFlagged: r.maybe_flagged,
            skipped: r.skipped,
            patternsUpserted: r.patterns_upserted,
            tokensInput: r.tokens_input,
            tokensOutput: r.tokens_output,
            tokensCacheCreation: r.tokens_cache_creation,
            tokensCacheRead: r.tokens_cache_read,
            errorMessage: r.error_message ?? undefined,
            createdAt: r.created_at,
        }));
    }
}
exports.AgentRunRepository = AgentRunRepository;
//# sourceMappingURL=agent-run.repository.js.map