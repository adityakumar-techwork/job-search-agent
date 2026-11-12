"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGeminiWithRetry = callGeminiWithRetry;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("./logger");
const deadModels = new Set();
async function callGeminiWithRetry(apiKey, _primaryModel, body, _opts) {
    const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']
        .filter((m) => !deadModels.has(m));
    let lastErr;
    for (const model of models) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const res = await axios_1.default.post(url, body, { timeout: 20000 });
                await new Promise((r) => setTimeout(r, 1200));
                return res;
            }
            catch (err) {
                lastErr = err;
                const status = err?.response?.status;
                if (status === 404) {
                    deadModels.add(model);
                    break;
                }
                if (status === 429) {
                    logger_1.logger.warn(`Quota/rate limit on ${model} — switching to next model`);
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
//# sourceMappingURL=gemini-retry.js.map