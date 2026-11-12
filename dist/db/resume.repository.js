"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResumeRepository = void 0;
const client_1 = require("./client");
const logger_1 = require("../utils/logger");
class ResumeRepository {
    async saveResumeMetadata(input) {
        const pool = (0, client_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // If the same hash is already current, just touch last_verified_at — no new row.
            const existing = await client.query('SELECT id FROM resume_metadata WHERE resume_hash = $1 AND is_current = TRUE', [input.resume_hash]);
            if (existing.rows.length > 0) {
                await client.query('UPDATE resume_metadata SET last_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [existing.rows[0].id]);
                await client.query('COMMIT');
                return;
            }
            // Hash changed — retire old current row and insert a new one.
            await client.query('UPDATE resume_metadata SET is_current = FALSE, updated_at = NOW() WHERE is_current = TRUE');
            await client.query(`INSERT INTO resume_metadata
           (resume_hash, resume_redacted, years_experience, technologies, companies,
            education_level, certifications, soft_skills, is_current, loaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW())`, [
                input.resume_hash,
                input.resume_redacted,
                input.years_experience ?? null,
                input.technologies ?? null,
                input.companies ?? null,
                input.education_level ?? null,
                input.certifications ?? null,
                input.soft_skills ?? null,
            ]);
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async getResumeMetadata() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query('SELECT * FROM resume_metadata WHERE is_current = TRUE LIMIT 1');
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        return {
            id: row.id,
            yearsExperience: row.years_experience ?? undefined,
            technologies: row.technologies ?? undefined,
            companies: row.companies ?? undefined,
            educationLevel: row.education_level ?? undefined,
            certifications: row.certifications ?? undefined,
            softSkills: row.soft_skills ?? undefined,
            resumeHash: row.resume_hash,
            resumeRedacted: row.resume_redacted,
            loadedAt: row.loaded_at,
            lastVerifiedAt: row.last_verified_at ?? undefined,
            isCurrent: row.is_current,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    async markAnalysisStale() {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`UPDATE claude_analysis
       SET is_stale = TRUE, stale_reason = 'resume_updated', updated_at = NOW()
       WHERE is_stale = FALSE`);
        logger_1.logger.info(`Marked ${result.rowCount ?? 0} analyses as stale`);
    }
    async decayPatternConfidence(factor) {
        const pool = (0, client_1.getPool)();
        await pool.query('UPDATE agent_memory SET confidence_score = LEAST(confidence_score * $1, 1.00), updated_at = NOW()', [factor]);
        logger_1.logger.info(`Decayed all pattern confidence by ${((1 - factor) * 100).toFixed(0)}%`);
    }
    async resetAgentMemory() {
        const pool = (0, client_1.getPool)();
        await pool.query('DELETE FROM agent_memory');
        logger_1.logger.info('Reset all agent memory patterns');
    }
}
exports.ResumeRepository = ResumeRepository;
//# sourceMappingURL=resume.repository.js.map