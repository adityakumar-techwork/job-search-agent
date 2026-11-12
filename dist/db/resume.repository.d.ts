import { ResumeMetadata } from '../types';
export interface SaveResumeInput {
    resume_hash: string;
    resume_redacted: string;
    years_experience?: number;
    technologies?: string[];
    companies?: string[];
    education_level?: string;
    certifications?: string[];
    soft_skills?: string[];
}
export declare class ResumeRepository {
    saveResumeMetadata(input: SaveResumeInput): Promise<void>;
    getResumeMetadata(): Promise<ResumeMetadata | null>;
    markAnalysisStale(): Promise<void>;
    decayPatternConfidence(factor: number): Promise<void>;
    resetAgentMemory(): Promise<void>;
}
//# sourceMappingURL=resume.repository.d.ts.map