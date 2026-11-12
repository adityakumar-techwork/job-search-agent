import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '../types';
export declare class ClaudeService {
    private readonly apiKey;
    private readonly model;
    private readonly maxTokens;
    private tokensInput;
    private tokensOutput;
    constructor(apiKey: string, model: string, maxTokens: number);
    getTokenUsage(): {
        input: number;
        output: number;
    };
    resetTokenUsage(): void;
    call(prompt: string): Promise<string>;
    callWithTools(prompt: string, _tools: Tool[]): Promise<Anthropic.Message>;
}
//# sourceMappingURL=claude.service.d.ts.map