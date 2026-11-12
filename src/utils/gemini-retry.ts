import axios from 'axios';
import { logger } from './logger';

const deadModels = new Set<string>();

export async function callGeminiWithRetry(apiKey: string, _primaryModel: string, body: unknown, _opts?: unknown) {
  const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']
    .filter((m) => !deadModels.has(m));

  let lastErr: unknown;
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await axios.post(url, body, { timeout: 20000 });
        await new Promise((r) => setTimeout(r, 1200));
        return res;
      } catch (err: any) {
        lastErr = err;
        const status = err?.response?.status;
        if (status === 404) {
          deadModels.add(model);
          break;
        }
        if (status === 429) {
          logger.warn(`Quota/rate limit on ${model} — switching to next model`);
          break;
        }
        if (err?.code === 'ECONNABORTED' || [500, 502, 503, 504].includes(status)) {
          await new Promise((r) => setTimeout(r, attempt * 1500));
          continue;
        }
        throw err;
      }
    }
  }
  throw lastErr;
}
