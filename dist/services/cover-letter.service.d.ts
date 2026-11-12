import { ClaudeAnalysisService } from './claude-analysis.service';
export declare class CoverLetterService {
    private readonly claudeAnalysisService;
    private readonly queryRepo;
    private readonly analysisRepo;
    private readonly resumeRepo;
    private readonly memoryRepo;
    constructor(claudeAnalysisService: ClaudeAnalysisService);
    getOrCreate(jobId: string): Promise<string | null>;
}
//# sourceMappingURL=cover-letter.service.d.ts.map