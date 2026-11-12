"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResumeChangeDetectionService = void 0;
const resume_service_1 = require("./resume.service");
const logger_1 = require("../utils/logger");
class ResumeChangeDetectionService {
    constructor(repository) {
        this.repository = repository;
    }
    async detectChange(newHash, newMetadata) {
        const existing = await this.repository.getResumeMetadata();
        if (!existing || existing.resumeHash === newHash) {
            return { changed: false, changeScore: 0, action: 'none' };
        }
        const changeScore = this.computeChangeScore(existing, newMetadata);
        const action = changeScore > 0.5 ? 'reset_memory' : 'decay_confidence';
        logger_1.logger.info('Resume change detected', { changeScore: changeScore.toFixed(2), action });
        return { changed: true, changeScore, action };
    }
    // Scoring weights (total = 1.0):
    //   40% — tech stack overlap (Jaccard distance; Java→Python = 0.0 overlap = major)
    //   30% — seniority level shift (normalised index distance across the ladder)
    //   20% — years-of-experience delta (relative change, capped at 1.0)
    //   10% — company/industry shift (Jaccard distance on known company names)
    computeChangeScore(old, next) {
        // Tech stack overlap (40%)
        const oldTechs = new Set((old.technologies ?? []).map((t) => t.toLowerCase()));
        const newTechs = new Set((next.technologies ?? []).map((t) => t.toLowerCase()));
        const techUnion = new Set([...oldTechs, ...newTechs]);
        const techIntersection = [...oldTechs].filter((t) => newTechs.has(t)).length;
        const techScore = techUnion.size > 0 ? 1 - techIntersection / techUnion.size : 0;
        // Seniority level change (30%)
        const SENIORITY_LADDER = ['Intern', 'Associate', 'Junior', 'Senior', 'Lead', 'Staff', 'Principal'];
        const oldSeniority = (0, resume_service_1.extractSeniorityLevel)(old.resumeRedacted);
        const newSeniority = (0, resume_service_1.extractSeniorityLevel)(next.resumeRedacted);
        let seniorityScore = 0;
        if (oldSeniority && newSeniority && oldSeniority !== newSeniority) {
            const oldIdx = SENIORITY_LADDER.indexOf(oldSeniority);
            const newIdx = SENIORITY_LADDER.indexOf(newSeniority);
            seniorityScore = Math.abs(oldIdx - newIdx) / (SENIORITY_LADDER.length - 1);
        }
        else if (!!oldSeniority !== !!newSeniority) {
            // One resume has a seniority marker, the other doesn't
            seniorityScore = 0.5;
        }
        // Years of experience delta (20%)
        const oldYears = old.yearsExperience ?? 0;
        const newYears = next.yearsExperience ?? 0;
        const maxYears = Math.max(oldYears, newYears, 1);
        const yearsScore = Math.min(Math.abs(newYears - oldYears) / maxYears, 1);
        // Company/industry shift (10%)
        const oldCompanies = new Set((old.companies ?? []).map((c) => c.toLowerCase()));
        const newCompanies = new Set((next.companies ?? []).map((c) => c.toLowerCase()));
        const companyUnion = new Set([...oldCompanies, ...newCompanies]);
        const companyIntersection = [...oldCompanies].filter((c) => newCompanies.has(c)).length;
        const companyScore = companyUnion.size > 0 ? 1 - companyIntersection / companyUnion.size : 0;
        return 0.4 * techScore + 0.3 * seniorityScore + 0.2 * yearsScore + 0.1 * companyScore;
    }
}
exports.ResumeChangeDetectionService = ResumeChangeDetectionService;
//# sourceMappingURL=resume-change.service.js.map