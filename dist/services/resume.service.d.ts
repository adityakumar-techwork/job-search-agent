import { ResumeMetadata } from '../types';
export declare function extractSeniorityLevel(text: string): string | undefined;
export declare class ResumeService {
    loadAndRedact(resumePath: string): Promise<{
        redactedText: string;
        hash: string;
        metadata: ResumeMetadata;
    }>;
}
//# sourceMappingURL=resume.service.d.ts.map