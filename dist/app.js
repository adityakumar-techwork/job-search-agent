"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = require("./middleware/cors");
const errorHandler_1 = require("./middleware/errorHandler");
const index_1 = require("./routes/index");
const client_1 = require("./db/client");
const logger_1 = require("./utils/logger");
const startedAt = new Date();
function createApp(locationPriority, coverLetterService) {
    const app = (0, express_1.default)();
    app.use(cors_1.corsMiddleware);
    app.use(express_1.default.json());
    app.use((req, _res, next) => {
        if (req.path !== '/health')
            logger_1.logger.info(`${req.method} ${req.path}`);
        next();
    });
    app.get('/health', async (_req, res) => {
        const uptimeSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
        try {
            await (0, client_1.getPool)().query('SELECT 1');
            res.json({ status: 'ok', db: 'ok', uptime: uptimeSeconds, startedAt });
        }
        catch (err) {
            logger_1.logger.error('Health check: DB unreachable', { error: err instanceof Error ? err.message : String(err) });
            res.status(503).json({ status: 'degraded', db: 'unreachable', uptime: uptimeSeconds, startedAt });
        }
    });
    app.use('/api', (0, index_1.createApiRouter)(locationPriority, coverLetterService));
    app.use(errorHandler_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map