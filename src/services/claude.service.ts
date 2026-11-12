import { callGeminiWithRetry } from '../utils/gemini-retry';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '../types';
import { logger } from '../utils/logger';

export class ClaudeService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private tokensInput = 0;
  private tokensOutput = 0;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.apiKey = apiKey;
    this.model = model || 'gemini-3.8-flash';
    this.maxTokens = maxTokens;
  }

  getTokenUsage(): { input: number; output: number } {
    return { input: this.tokensInput, output: this.tokensOutput };
  }

  resetTokenUsage(): void {
    this.tokensInput = 0;
    this.tokensOutput = 0;
  }

  async call(prompt: string): Promise<string> {
    logger.info('Calling Gemini API', { model: this.model });
    const res = await callGeminiWithRetry(this.apiKey, this.model,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: this.maxTokens },
      },
      { timeout: 60000 },
    );
    const usage = res.data?.usageMetadata ?? {};
    this.tokensInput += usage.promptTokenCount ?? 0;
    this.tokensOutput += usage.candidatesTokenCount ?? 0;
    return res.data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  }

  async callWithTools(prompt: string, _tools: Tool[]): Promise<Anthropic.Message> {
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
    } as unknown as Anthropic.Message;
  }
}
