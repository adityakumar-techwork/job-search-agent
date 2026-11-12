"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const application_repository_1 = require("../db/application.repository");
const router = (0, express_1.Router)();
const appRepo = new application_repository_1.ApplicationRepository();
const VALID_STATUSES = [
    'applied',
    'interview_scheduled',
    'rejected',
    'offer',
    'archived',
];
router.post('/', async (req, res) => {
    const { jobId } = req.body;
    if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
    }
    const application = await appRepo.recordApplication(jobId);
    res.status(201).json({
        success: true,
        data: {
            applicationId: application.id,
            jobId: application.jobId,
            appliedAt: application.appliedAt,
        },
    });
});
router.get('/', async (req, res) => {
    const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const applications = await appRepo.getApplications();
    const filtered = statusFilter
        ? applications.filter((a) => a.status === statusFilter)
        : applications;
    res.json({ success: true, data: { applications: filtered }, count: filtered.length });
});
router.patch('/:jobId', async (req, res) => {
    const jobId = req.params['jobId'];
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({
            success: false,
            error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
        });
        return;
    }
    const updated = await appRepo.updateApplicationStatus(jobId, status);
    if (!updated) {
        res.status(404).json({ success: false, error: 'Application not found for this job' });
        return;
    }
    res.json({
        success: true,
        data: {
            jobId: updated.jobId,
            status: updated.status,
            updatedAt: updated.updatedAt,
        },
    });
});
exports.default = router;
//# sourceMappingURL=applications.js.map