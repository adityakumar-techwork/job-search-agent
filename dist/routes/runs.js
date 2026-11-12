"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agent_run_repository_1 = require("../db/agent-run.repository");
const router = (0, express_1.Router)();
const agentRunRepository = new agent_run_repository_1.AgentRunRepository();
router.get('/', async (_req, res) => {
    const runs = await agentRunRepository.getRecentRuns(30);
    res.json({ data: { runs } });
});
exports.default = router;
//# sourceMappingURL=runs.js.map