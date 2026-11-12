"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiRouter = createApiRouter;
const express_1 = require("express");
const jobs_1 = require("./jobs");
const analyses_1 = require("./analyses");
const applications_1 = __importDefault(require("./applications"));
const interactions_1 = __importDefault(require("./interactions"));
const runs_1 = __importDefault(require("./runs"));
function createApiRouter(locationPriority, coverLetterService) {
    const router = (0, express_1.Router)();
    router.use('/jobs', (0, jobs_1.createJobsRouter)(locationPriority));
    router.use('/analyses', (0, analyses_1.createAnalysesRouter)(coverLetterService));
    router.use('/patterns', analyses_1.patternsRouter);
    router.use('/applications', applications_1.default);
    router.use('/interactions', interactions_1.default);
    router.use('/runs', runs_1.default);
    return router;
}
//# sourceMappingURL=index.js.map