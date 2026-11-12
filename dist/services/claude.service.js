"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeService = void 0;
const gemini_retry_1 = require("../utils/gemini-retry");
const logger_1 = require("../utils/logger");
class ClaudeService {
    constructor(apiKey, model, maxTokens) {
        this.tokensInput = 0;
        this.tokensOutput = 0;
        this.apiKey = apiKey;
        this.model = model || 'gemini-3.8-flash';
        this.maxTokens = maxTokens;
    }
    getTokenUsage() {
        return { input: this.tokensInput, output: this.tokensOutput };
    }
    resetTokenUsage() {
        this.tokensInput = 0;
        this.tokensOutput = 0;
    }
    async call(prompt) {
        logger_1.logger.info('Calling Gemini API', { model: this.model });
        const res = await (0, gemini_retry_1.callGeminiWithRetry)(this.apiKey, this.model, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: this.maxTokens },
        }, { timeout: 60000 });
        const usage = res.data?.usageMetadata ?? {};
        this.tokensInput += usage.promptTokenCount ?? 0;
        this.tokensOutput += usage.candidatesTokenCount ?? 0;
        return res.data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    }
    async callWithTools(prompt, _tools) {
        const text = await this.call(prompt);
        return {
            id: `gem_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            model: this.model,
            content: [{ type: 'text', text, citations: null }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
                input_tokens: this.tokensInput,
                output_tokens: this.tokensOutput,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                server_tool_use: null,
                service_tier: 'standard',
            },
        };
    }
}
exports.ClaudeService = ClaudeService;
//# sourceMappingURL=claude.service.js.map