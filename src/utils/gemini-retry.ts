import axios, { AxiosResponse } from 'axios';
import { logger } from './logger';

// Thin Gemini generateContent client with model fallback, retry, and pacing.
//
// - The configured model is always tried first; LLM_FALLBACK_MODELS are tried in order after it.
// - The API key is sent in the x-goog-api-key header, never in the URL, so it can't leak into
//   proxy/access logs or axios error messages.
// - A model that returns 404 (retired / not enabled for this key) is skipped for the rest of the
//   process. 429 retries once on the same model after the server's suggested delay, then falls
//   back to the next model. 5xx / timeouts retry with backoff.

export interface GeminiCallOptions {
  timeoutMs?: number;
  fallbackModels?: string[];
  // Minimum gap between successive successful requests (free-tier RPM limits).
  minIntervalMs?: number;
  baseUrl?: string;
}

export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

export interface GeminiResult {
  text: string;
  model: string;
  usage: GeminiUsage;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_ATTEMPTS_PER_MODEL = 3;

const deadModels = new Set<string>();
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Gemini puts the suggested retry delay in error.details[].retryDelay ("12s"); fall back to Retry-After.
function retryDelayMs(err: unknown, attempt: number): number {
  const data = (err as { response?: { data?: unknown; headers?: Record<string, string> } })?.response;
  const details = (data?.data as { error?: { details?: { retryDelay?: string }[] } })?.error?.details ?? [];
  for (const d of details) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay ?? '');
    if (m) return Math.min(parseFloat(m[1]) * 1000, 60_000);
  }
  const header = Number(data?.headers?.['retry-after']);
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 60_000);
  return attempt * 2000;
}

export function resetGeminiStateForTests(): void {
  deadModels.clear();
  lastCallAt = 0;
}

export async function callGemini(
  apiKey: string,
  primaryModel: string,
  body: unknown,
  opts: GeminiCallOptions = {},
): Promise<GeminiResult> {
  const baseUrl = (opts.baseUrl || process.env['LLM_API_BASE_URL'] || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeout = opts.timeoutMs ?? 60_000;
  const minInterval = opts.minIntervalMs ?? 0;
  const models = [...new Set([primaryModel, ...(opts.fallbackModels ?? [])].filter(Boolean))].filter(
    (m) => !deadModels.has(m),
  );
  if (models.length === 0) {
    throw new Error('No usable Gemini model — every configured model returned 404. Check LLM_MODEL / LLM_FALLBACK_MODELS.');
  }

  let lastErr: unknown;
  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const wait = lastCallAt + minInterval - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        const res: AxiosResponse = await axios.post(
          `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
          body,
          { timeout, headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' } },
        );
        lastCallAt = Date.now();
        const candidate = res.data?.candidates?.[0];
        const text: string =
          candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        if (!text) {
          // Blocked by safety filters, or hit max tokens before emitting anything — not retryable.
          const reason = candidate?.finishReason ?? res.data?.promptFeedback?.blockReason ?? 'unknown';
          throw Object.assign(new Error(`Gemini returned no text (finishReason=${reason})`), { nonRetryable: true });
        }
        if (model !== primaryModel) logger.info(`Gemini: served by fallback model ${model}`);
        return { text, model, usage: res.data?.usageMetadata ?? {} };
      } catch (err: unknown) {
        lastErr = err;
        if ((err as { nonRetryable?: boolean }).nonRetryable) throw err;
        const status = (err as { response?: { status?: number } })?.response?.status;
        const code = (err as { code?: string })?.code;
        if (status === 404) {
          logger.warn(`Gemini: model ${model} not found — skipping it for this run`);
          deadModels.add(model);
          break;
        }
        if (status === 429) {
          if (attempt === 1) {
            const delay = retryDelayMs(err, attempt);
            logger.warn(`Gemini: rate limited on ${model} — retrying in ${Math.round(delay / 1000)}s`);
            await sleep(delay);
            continue;
          }
          logger.warn(`Gemini: still rate limited on ${model} — trying next model`);
          break;
        }
        if (code === 'ECONNABORTED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || (status !== undefined && status >= 500)) {
          await sleep(attempt * 1500);
          continue;
        }
        // 400 / 401 / 403 etc. are configuration errors — retrying or switching models won't help.
        throw err;
      }
    }
  }
  throw lastErr ?? new Error('Gemini call failed');
}
