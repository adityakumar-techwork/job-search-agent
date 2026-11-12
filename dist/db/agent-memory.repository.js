"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentMemoryRepository = void 0;
const client_1 = require("./client");
const logger_1 = require("../utils/logger");
class AgentMemoryRepository {
    async getAll() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query('SELECT * FROM agent_memory ORDER BY confidence_score DESC');
        return result.rows.map((row) => ({
            id: row.id,
            patternName: row.pattern_name,
            patternType: row.pattern_type,
            patternData: row.pattern_data,
            confidenceScore: parseFloat(row.confidence_score),
            firstObservedAt: row.first_observed_at,
            lastObservedAt: row.last_observed_at,
            observationCount: row.observation_count,
            recommendations: row.recommendations ?? undefined,
            nextStrategyFocus: row.next_strategy_focus ?? undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    async upsertPattern(pattern) {
        const pool = (0, client_1.getPool)();
        await pool.query(`INSERT INTO agent_memory
         (pattern_name, pattern_type, pattern_data, confidence_score, observation_count,
          first_observed_at, last_observed_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (pattern_name)
       DO UPDATE SET
         confidence_score   = EXCLUDED.confidence_score,
         observation_count  = agent_memory.observation_count + EXCLUDED.observation_count,
         last_observed_at   = NOW(),
         updated_at         = NOW()`, [
            pattern.patternName,
            pattern.patternType,
            JSON.stringify(pattern.patternData),
            pattern.confidenceScore,
            pattern.observationCount,
        ]);
    }
    async upsertAll(patterns) {
        for (const pattern of patterns) {
            await this.upsertPattern(pattern);
        }
        logger_1.logger.info(`Upserted ${patterns.length} agent memory patterns`);
    }
}
exports.AgentMemoryRepository = AgentMemoryRepository;
//# sourceMappingURL=agent-memory.repository.js.map