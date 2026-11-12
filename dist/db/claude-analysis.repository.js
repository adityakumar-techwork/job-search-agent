"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeAnalysisQueryRepository = exports.ClaudeAnalysisRepository = void 0;
const client_1 = require("./client");
class ClaudeAnalysisRepository {
    async saveAnalysis(jobId, analysis, locationCategory, coverLetterDraft) {
        const pool = (0, client_1.getPool)();
        await pool.query(`INSERT INTO claude_analysis (
        job_id, relevance_score, interview_chance,
        location_category, overall_category,
        relevance_reasoning, insights,
        cover_letter_draft, matched_patterns
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (job_id) DO UPDATE SET
        relevance_score     = EXCLUDED.relevance_score,
        interview_chance    = EXCLUDED.interview_chance,
        overall_category    = EXCLUDED.overall_category,
        relevance_reasoning = EXCLUDED.relevance_reasoning,
        insights            = EXCLUDED.insights,
        cover_letter_draft  = EXCLUDED.cover_letter_draft,
        matched_patterns    = EXCLUDED.matched_patterns,
        is_stale            = FALSE,
        analyzed_at         = CURRENT_TIMESTAMP`, [
            jobId,
            analysis.relevanceScore,
            analysis.interviewChance,
            locationCategory,
            analysis.overallCategory,
            analysis.relevanceReasoning,
            analysis.insights,
            coverLetterDraft ?? null,
            analysis.matchedPatterns,
        ]);
    }
    // Lazily persist a cover letter generated on demand (Task 3), leaving the rest of the
    // analysis untouched.
    async updateCoverLetter(jobId, draft) {
        const pool = (0, client_1.getPool)();
        await pool.query(`UPDATE claude_analysis SET cover_letter_draft = $2 WHERE job_id = $1`, [jobId, draft]);
    }
    async getAnalysesByCategory(category) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM claude_analysis
       WHERE overall_category = $1 AND is_stale = FALSE
       ORDER BY relevance_score DESC`, [category]);
        return result.rows.map(mapRow);
    }
    async getRecentAnalyses(limit = 20) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM claude_analysis
       WHERE is_stale = FALSE
       ORDER BY analyzed_at DESC
       LIMIT $1`, [limit]);
        return result.rows.map(mapRow);
    }
    async getAnalysisByJobId(jobId) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT * FROM claude_analysis WHERE job_id = $1`, [jobId]);
        return result.rows[0] ? mapRow(result.rows[0]) : null;
    }
}
exports.ClaudeAnalysisRepository = ClaudeAnalysisRepository;
class ClaudeAnalysisQueryRepository {
    async getJobsWithAnalysis(category) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT
         j.id AS job_id, j.title, j.company, j.location,
         j.location_category, j.apply_url, j.source,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.relevance_score, ca.interview_chance, ca.overall_category,
         ca.relevance_reasoning, ca.insights, ca.matched_patterns,
         ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON j.id = ca.job_id
       WHERE ca.overall_category = $1 AND ca.is_stale = FALSE
       ORDER BY ca.relevance_score DESC`, [category]);
        return result.rows.map(mapJoinRow);
    }
    async getJobsByLocation(category) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT
         j.id AS job_id, j.title, j.company, j.location,
         j.location_category, j.apply_url, j.source,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.relevance_score, ca.interview_chance, ca.overall_category,
         ca.relevance_reasoning, ca.insights, ca.matched_patterns,
         ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON j.id = ca.job_id
       WHERE j.location_category = $1 AND ca.is_stale = FALSE
       ORDER BY ca.relevance_score DESC`, [category]);
        return result.rows.map(mapJoinRow);
    }
    async getAllWithJobs(limit = 50, offset = 0) {
        const pool = (0, client_1.getPool)();
        const [dataResult, countResult] = await Promise.all([
            pool.query(`SELECT
           j.id AS job_id, j.title, j.company, j.location, j.location_category,
           j.apply_url, j.source,
           j.recruiter_name, j.recruiter_email,
           j.company_hiring_url, j.company_size, j.company_website,
           ca.id AS analysis_id, ca.relevance_score, ca.interview_chance,
           ca.overall_category, ca.relevance_reasoning, ca.insights,
           ca.matched_patterns, ca.cover_letter_draft, ca.analyzed_at,
           (ji_s.id IS NOT NULL) AS is_saved,
           (ji_ni.id IS NOT NULL) AS is_not_interested,
           (a.id IS NOT NULL) AS is_applied
         FROM jobs j
         JOIN claude_analysis ca ON j.id = ca.job_id
         LEFT JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
         LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
         LEFT JOIN applications a ON a.job_id = j.id
         WHERE ca.is_stale = FALSE
         ORDER BY ca.analyzed_at DESC
         LIMIT $1 OFFSET $2`, [limit, offset]),
            pool.query(`SELECT COUNT(*) FROM claude_analysis WHERE is_stale = FALSE`),
        ]);
        const rows = dataResult.rows.map((row) => ({
            job: {
                id: row.job_id,
                title: row.title,
                company: row.company,
                location: row.location,
                locationCategory: row.location_category,
                applyUrl: row.apply_url,
                source: row.source,
                recruiterName: row.recruiter_name,
                recruiterEmail: row.recruiter_email,
                companyHiringUrl: row.company_hiring_url,
                companySize: row.company_size,
                companyWebsite: row.company_website,
                isSaved: row.is_saved,
                isNotInterested: row.is_not_interested,
                isApplied: row.is_applied,
            },
            analysis: {
                id: row.analysis_id,
                relevanceScore: parseFloat(row.relevance_score),
                interviewChance: parseFloat(row.interview_chance),
                overallCategory: row.overall_category,
                relevanceReasoning: row.relevance_reasoning,
                insights: row.insights,
                matchedPatterns: row.matched_patterns,
                coverLetterDraft: row.cover_letter_draft,
                analyzedAt: row.analyzed_at,
            },
        }));
        return { rows, total: parseInt(countResult.rows[0].count, 10) };
    }
    async getAllJobs(limit = 100, offset = 0) {
        const pool = (0, client_1.getPool)();
        const [dataResult, countResult] = await Promise.all([
            pool.query(`SELECT
           j.id, j.title, j.company, j.location, j.location_category,
           j.apply_url, j.source, j.posted_at, j.fetched_at,
           ca.relevance_score, ca.interview_chance, ca.overall_category, ca.analyzed_at,
           (ji_s.id IS NOT NULL) AS is_saved,
           (ji_ni.id IS NOT NULL) AS is_not_interested
         FROM jobs j
         LEFT JOIN claude_analysis ca ON ca.job_id = j.id AND ca.is_stale = FALSE
         LEFT JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
         LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
         ORDER BY j.posted_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`, [limit, offset]),
            pool.query(`SELECT COUNT(*) FROM jobs`),
        ]);
        const rows = dataResult.rows.map((row) => ({
            id: row.id,
            title: row.title,
            company: row.company,
            location: row.location,
            locationCategory: row.location_category,
            applyUrl: row.apply_url,
            source: row.source,
            postedAt: row.posted_at,
            fetchedAt: row.fetched_at,
            isAnalyzed: row.overall_category != null,
            relevanceScore: row.relevance_score != null ? parseFloat(row.relevance_score) : undefined,
            interviewChance: row.interview_chance != null ? parseFloat(row.interview_chance) : undefined,
            overallCategory: row.overall_category,
            analyzedAt: row.analyzed_at,
            isSaved: row.is_saved,
            isNotInterested: row.is_not_interested,
        }));
        return { rows, total: parseInt(countResult.rows[0].count, 10) };
    }
    async getSavedJobs(limit = 200, offset = 0) {
        const pool = (0, client_1.getPool)();
        const [dataResult, countResult] = await Promise.all([
            pool.query(`SELECT
           j.id, j.title, j.company, j.location, j.location_category,
           j.apply_url, j.source, j.posted_at, j.fetched_at,
           ca.relevance_score, ca.interview_chance, ca.overall_category, ca.analyzed_at,
           TRUE AS is_saved,
           (ji_ni.id IS NOT NULL) AS is_not_interested
         FROM jobs j
         JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
         LEFT JOIN claude_analysis ca ON ca.job_id = j.id AND ca.is_stale = FALSE
         LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
         ORDER BY ji_s.created_at DESC
         LIMIT $1 OFFSET $2`, [limit, offset]),
            pool.query(`SELECT COUNT(*) FROM job_interactions WHERE interaction_type = 'saved'`),
        ]);
        const rows = dataResult.rows.map((row) => ({
            id: row.id,
            title: row.title,
            company: row.company,
            location: row.location,
            locationCategory: row.location_category,
            applyUrl: row.apply_url,
            source: row.source,
            postedAt: row.posted_at,
            fetchedAt: row.fetched_at,
            isAnalyzed: row.overall_category != null,
            relevanceScore: row.relevance_score != null ? parseFloat(row.relevance_score) : undefined,
            interviewChance: row.interview_chance != null ? parseFloat(row.interview_chance) : undefined,
            overallCategory: row.overall_category,
            analyzedAt: row.analyzed_at,
            isSaved: true,
            isNotInterested: row.is_not_interested,
        }));
        return { rows, total: parseInt(countResult.rows[0].count, 10) };
    }
    async getJobWithOptionalAnalysis(jobId) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT
         j.id AS job_id, j.title, j.company, j.location, j.location_category,
         j.description, j.apply_url, j.source, j.posted_at,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.id AS analysis_id, ca.relevance_score, ca.interview_chance,
         ca.overall_category, ca.relevance_reasoning, ca.insights,
         ca.matched_patterns, ca.cover_letter_draft, ca.analyzed_at,
         (ji_s.id IS NOT NULL) AS is_saved,
         (ji_ni.id IS NOT NULL) AS is_not_interested
       FROM jobs j
       LEFT JOIN claude_analysis ca ON ca.job_id = j.id AND ca.is_stale = FALSE
       LEFT JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
       LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
       WHERE j.id = $1`, [jobId]);
        if (!result.rows[0])
            return null;
        const row = result.rows[0];
        const hasAnalysis = row.analysis_id != null;
        return {
            job: {
                id: row.job_id,
                title: row.title,
                company: row.company,
                location: row.location,
                locationCategory: row.location_category,
                description: row.description,
                applyUrl: row.apply_url,
                source: row.source,
                recruiterName: row.recruiter_name,
                recruiterEmail: row.recruiter_email,
                companyHiringUrl: row.company_hiring_url,
                companySize: row.company_size,
                companyWebsite: row.company_website,
                isSaved: row.is_saved,
                isNotInterested: row.is_not_interested,
            },
            analysis: hasAnalysis
                ? {
                    id: row.analysis_id,
                    relevanceScore: parseFloat(row.relevance_score),
                    interviewChance: parseFloat(row.interview_chance),
                    overallCategory: row.overall_category,
                    relevanceReasoning: row.relevance_reasoning,
                    insights: row.insights,
                    matchedPatterns: row.matched_patterns,
                    coverLetterDraft: row.cover_letter_draft,
                    analyzedAt: row.analyzed_at,
                }
                : null,
        };
    }
    async getWithJob(jobId) {
        const pool = (0, client_1.getPool)();
        const result = await pool.query(`SELECT
         j.id AS job_id, j.title, j.company, j.location, j.location_category,
         j.description, j.apply_url, j.source,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.id AS analysis_id, ca.relevance_score, ca.interview_chance,
         ca.overall_category, ca.relevance_reasoning, ca.insights,
         ca.matched_patterns, ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON j.id = ca.job_id
       WHERE j.id = $1`, [jobId]);
        if (!result.rows[0])
            return null;
        const row = result.rows[0];
        return {
            job: {
                id: row.job_id,
                title: row.title,
                company: row.company,
                location: row.location,
                locationCategory: row.location_category,
                description: row.description,
                applyUrl: row.apply_url,
                source: row.source,
                recruiterName: row.recruiter_name,
                recruiterEmail: row.recruiter_email,
                companyHiringUrl: row.company_hiring_url,
                companySize: row.company_size,
                companyWebsite: row.company_website,
            },
            analysis: {
                id: row.analysis_id,
                relevanceScore: parseFloat(row.relevance_score),
                interviewChance: parseFloat(row.interview_chance),
                overallCategory: row.overall_category,
                relevanceReasoning: row.relevance_reasoning,
                insights: row.insights,
                matchedPatterns: row.matched_patterns,
                coverLetterDraft: row.cover_letter_draft,
                analyzedAt: row.analyzed_at,
            },
        };
    }
}
exports.ClaudeAnalysisQueryRepository = ClaudeAnalysisQueryRepository;
function mapJoinRow(row) {
    return {
        jobId: row.job_id,
        title: row.title,
        company: row.company,
        location: row.location,
        locationCategory: row.location_category,
        applyUrl: row.apply_url,
        source: row.source,
        recruiterName: row.recruiter_name,
        recruiterEmail: row.recruiter_email,
        companyHiringUrl: row.company_hiring_url,
        companySize: row.company_size,
        companyWebsite: row.company_website,
        relevanceScore: parseFloat(row.relevance_score),
        interviewChance: parseFloat(row.interview_chance),
        overallCategory: row.overall_category,
        relevanceReasoning: row.relevance_reasoning,
        insights: row.insights,
        matchedPatterns: row.matched_patterns,
        coverLetterDraft: row.cover_letter_draft,
        analyzedAt: row.analyzed_at,
    };
}
function mapRow(row) {
    return {
        id: row.id,
        jobId: row.job_id,
        relevanceScore: parseFloat(row.relevance_score),
        interviewChance: parseFloat(row.interview_chance),
        locationCategory: row.location_category,
        overallCategory: row.overall_category,
        relevanceReasoning: row.relevance_reasoning,
        insights: row.insights,
        coverLetterDraft: row.cover_letter_draft,
        matchedPatterns: row.matched_patterns,
        isStale: row.is_stale,
        staleReason: row.stale_reason,
        analyzedAt: row.analyzed_at,
        createdAt: row.created_at,
    };
}
//# sourceMappingURL=claude-analysis.repository.js.map