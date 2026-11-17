import { callGemini } from '../utils/gemini-retry';
import { logger } from '../utils/logger';

// General-purpose LLM client used for the agent's free-text steps (daily strategy). The class
// keeps its historical name; it talks to Gemini (see utils/gemini-retry.ts).
export interface LlmOptions {
  fallbackModels?: string[];
  minIntervalMs?: number;
}

export class ClaudeService {
  private tokensInput = 0;
  private tokensOutput = 0;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number,
    private readonly opts: LlmOptions = {},
  ) {}

  getTokenUsage(): { input: number; output: number } {
    return { input: this.tokensInput, output: this.tokensOutput };
  }

  resetTokenUsage(): void {
    this.tokensInput = 0;
    this.tokensOutput = 0;
  }

  async call(prompt: string): Promise<string> {
    logger.info('Calling Gemini API', { model: this.model });
    const { text, usage } = await callGemini(
      this.apiKey,
      this.model,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: this.maxTokens },
      },
      { timeoutMs: 60_000, fallbackModels: this.opts.fallbackModels, minIntervalMs: this.opts.minIntervalMs },
    );
    this.tokensInput += usage.promptTokenCount ?? 0;
    this.tokensOutput += usage.candidatesTokenCount ?? 0;
    return text;
  }
}
