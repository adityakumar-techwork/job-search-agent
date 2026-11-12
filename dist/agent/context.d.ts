import { ResumeMetadata } from '../types';
export interface AgentContext {
    resume?: {
        redactedText: string;
        hash: string;
        metadata: ResumeMetadata;
    };
}
export declare const agentContext: AgentContext;
//# sourceMappingURL=context.d.ts.map