"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patternsRouter = void 0;
exports.createAnalysesRouter = createAnalysesRouter;
const express_1 = require("express");
const claude_analysis_repository_1 = require("../db/claude-analysis.repository");
const agent_memory_repository_1 = require("../db/agent-memory.repository");
const logger_1 = require("../utils/logger");
const queryRepo = new claude_analysis_repository_1.ClaudeAnalysisQueryRepository();
const memoryRepo = new agent_memory_repository_1.AgentMemoryRepository();
// Factory so the cover-letter route can receive a configured CoverLetterService (which needs the
// Claude API key/model). When none is supplied (e.g. in tests), that route returns 503.
function createAnalysesRouter(coverLetterService) {
    const router = (0, express_1.Router)();
    router.get('/', async (req, res) => {
        const limit = Math.min(parseInt(req.query['limit'] ?? '50', 10) || 50, 100);
        const offset = parseInt(req.query['offset'] ?? '0', 10) || 0;
        const { rows: analyses, total } = await queryRepo.getAllWithJobs(limit, offset);
        res.json({ success: true, data: { analyses }, count: total });
    });
    router.get('/:jobId', async (req, res) => {
        const jobId = req.params['jobId'];
        const result = await queryRepo.getWithJob(jobId);
        if (!result) {
            res.status(404).json({ success: false, error: 'Analysis not found for this job' });
            return;
        }
        res.json({ success: true, data: result });
    });
    // Generate (or return the already-stored) cover letter for a job, on demand.
    router.post('/:jobId/cover-letter', async (req, res) => {
        if (!coverLetterService) {
            res.status(503).json({ success: false, error: 'Cover letter generation is not configured' });
            return;
        }
        const jobId = req.params['jobId'];
        try {
            const draft = await coverLetterService.getOrCreate(jobId);
            if (draft === null) {
                res.status(404).json({ success: false, error: 'Analysis not found for this job' });
                return;
            }
            res.json({ success: true, data: { coverLetterDraft: draft } });
        }
        catch (err) {
            logger_1.logger.error('Cover letter generation failed', {
                jobId,
                error: err instanceof Error ? err.message : String(err),
            });
            res.status(500).json({ success: false, error: 'Cover letter generation failed' });
        }
    });
    return router;
}
const patternsRouter = (0, express_1.Router)();
exports.patternsRouter = patternsRouter;
patternsRouter.get('/', async (_req, res) => {
    const patterns = await memoryRepo.getAll();
    const topSkillsMatched = [];
    const commonGaps = [];
    const recommendedFocus = [];
    const bestJobCategories = [];
    for (const p of patterns) {
        const data = p.patternData;
        if (Array.isArray(data['topSkills']))
            topSkillsMatched.push(...data['topSkills']);
        if (Array.isArray(data['gaps']))
            commonGaps.push(...data['gaps']);
        if (Array.isArray(data['categories']))
            bestJobCategories.push(...data['categories']);
        if (p.patternName.startsWith('focus_')) {
            recommendedFocus.push(p.patternName.replace(/^focus_/, '').replace(/_/g, ' '));
        }
    }
    res.json({
        success: true,
        data: {
            patterns: {
                topSkillsMatched: [...new Set(topSkillsMatched)],
                commonGaps: [...new Set(commonGaps)],
                recommendedFocus: [...new Set(recommendedFocus)],
                bestJobCategories: [...new Set(bestJobCategories)],
            },
        },
    });
});
//# sourceMappingURL=analyses.js.map