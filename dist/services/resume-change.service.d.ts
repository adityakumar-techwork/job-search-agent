import { ResumeMetadata } from '../types';
import { ResumeRepository } from '../db/resume.repository';
export type ChangeAction = 'reset_memory' | 'decay_confidence' | 'none';
export interface ChangeDetectionResult {
    changed: boolean;
    changeScore: number;
    action: ChangeAction;
}
export declare class ResumeChangeDetectionService {
    private readonly repository;
    constructor(repository: ResumeRepository);
    detectChange(newHash: string, newMetadata: ResumeMetadata): Promise<ChangeDetectionResult>;
    computeChangeScore(old: ResumeMetadata, next: ResumeMetadata): number;
}
//# sourceMappingURL=resume-change.service.d.ts.map