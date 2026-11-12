"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoverLetterService = void 0;
const claude_analysis_repository_1 = require("../db/claude-analysis.repository");
const resume_repository_1 = require("../db/resume.repository");
const agent_memory_repository_1 = require("../db/agent-memory.repository");
const logger_1 = require("../utils/logger");
// Cover letters are generated on demand rather than during the agent run (most are never used).
// Because generation no longer happens while the run's context is in memory, this service
// rebuilds everything the prompt needs — the job record, its analysis, the redacted résumé, and
// the learned focus patterns — from the database, then persists the result so repeat requests
// are cheap.
class CoverLetterService {
    constructor(claudeAnalysisService) {
        this.claudeAnalysisService = claudeAnalysisService;
        this.queryRepo = new claude_analysis_repository_1.ClaudeAnalysisQueryRepository();
        this.analysisRepo = new claude_analysis_repository_1.ClaudeAnalysisRepository();
        this.resumeRepo = new resume_repository_1.ResumeRepository();
        this.memoryRepo = new agent_memory_repository_1.AgentMemoryRepository();
    }
    // Returns null if the job has no analysis. Otherwise returns the stored draft if one exists,
    // or generates + persists a new one and returns it. Idempotent per job.
    async getOrCreate(jobId) {
        const item = await this.queryRepo.getWithJob(jobId);
        if (!item)
            return null;
        if (item.analysis.coverLetterDraft)
            return item.analysis.coverLetterDraft;
        const [resumeMeta, memory] = await Promise.all([
            this.resumeRepo.getResumeMetadata(),
            this.memoryRepo.getAll(),
        ]);
        if (!resumeMeta) {
            logger_1.logger.warn('No résumé in DB — generating cover letter without résumé context', { jobId });
        }
        const focusPatterns = memory
            .filter((m) => m.patternName.startsWith('focus_'))
            .map((m) => m.patternName.replace(/^focus_/, '').replace(/_/g, ' '));
        const cl = await this.claudeAnalysisService.generateCoverLetter({
            title: item.job.title,
            company: item.job.company,
            relevanceReasoning: item.analysis.relevanceReasoning,
            insights: item.analysis.insights,
        }, resumeMeta?.resumeRedacted ?? '', focusPatterns);
        const draft = [cl.opening, cl.body, cl.closing].join('\n\n');
        await this.analysisRepo.updateCoverLetter(jobId, draft);
        return draft;
    }
}
exports.CoverLetterService = CoverLetterService;
//# sourceMappingURL=cover-letter.service.js.map