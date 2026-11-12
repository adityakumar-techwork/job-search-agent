"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJobsRouter = createJobsRouter;
const express_1 = require("express");
const claude_analysis_repository_1 = require("../db/claude-analysis.repository");
function createJobsRouter(locationPriority) {
    const router = (0, express_1.Router)();
    const queryRepo = new claude_analysis_repository_1.ClaudeAnalysisQueryRepository();
    router.get('/all', async (req, res) => {
        const limit = Math.min(parseInt(String(req.query['limit'] ?? ''), 10) || 200, 500);
        const offset = parseInt(String(req.query['offset'] ?? ''), 10) || 0;
        const { rows, total } = await queryRepo.getAllJobs(limit, offset);
        res.json({ success: true, data: { jobs: rows }, count: total });
    });
    router.get('/saved', async (req, res) => {
        const limit = Math.min(parseInt(String(req.query['limit'] ?? ''), 10) || 200, 500);
        const offset = parseInt(String(req.query['offset'] ?? ''), 10) || 0;
        const { rows, total } = await queryRepo.getSavedJobs(limit, offset);
        res.json({ success: true, data: { jobs: rows }, count: total });
    });
    router.get('/auto-flagged', async (_req, res) => {
        const jobs = await queryRepo.getJobsWithAnalysis('auto-flag');
        res.json({ success: true, data: { jobs }, count: jobs.length });
    });
    router.get('/maybe-flagged', async (_req, res) => {
        const jobs = await queryRepo.getJobsWithAnalysis('maybe-flag');
        res.json({ success: true, data: { jobs }, count: jobs.length });
    });
    router.get('/by-location', async (req, res) => {
        const category = typeof req.query['category'] === 'string' ? req.query['category'] : '';
        if (!locationPriority.includes(category)) {
            res
                .status(400)
                .json({ success: false, error: `category must be one of: ${locationPriority.join(', ')}` });
            return;
        }
        const jobs = await queryRepo.getJobsByLocation(category);
        res.json({ success: true, data: { jobs, category }, count: jobs.length });
    });
    // Must be last — wildcard matches any /:id
    router.get('/:id', async (req, res) => {
        const result = await queryRepo.getJobWithOptionalAnalysis(req.params['id']);
        if (!result) {
            res.status(404).json({ success: false, error: 'Job not found' });
            return;
        }
        res.json({ success: true, data: result });
    });
    return router;
}
//# sourceMappingURL=jobs.js.map