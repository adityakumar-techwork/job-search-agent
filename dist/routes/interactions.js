"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const job_interaction_repository_1 = require("../db/job-interaction.repository");
const router = (0, express_1.Router)();
const interactionRepo = new job_interaction_repository_1.JobInteractionRepository();
router.patch('/:jobId', async (req, res) => {
    const jobId = req.params['jobId'];
    const { type, active } = req.body;
    if (type !== 'saved' && type !== 'not_interested') {
        res.status(400).json({ success: false, error: 'type must be "saved" or "not_interested"' });
        return;
    }
    if (typeof active !== 'boolean') {
        res.status(400).json({ success: false, error: 'active must be a boolean' });
        return;
    }
    await interactionRepo.setInteraction(jobId, type, active);
    res.json({ success: true, data: { jobId, type, active } });
});
exports.default = router;
//# sourceMappingURL=interactions.js.map