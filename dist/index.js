"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config/config");
const logger_1 = require("./utils/logger");
const client_1 = require("./db/client");
const app_1 = require("./app");
const cover_letter_service_1 = require("./services/cover-letter.service");
const claude_analysis_service_1 = require("./services/claude-analysis.service");
// This is the REST API server for the dashboard — it only needs Claude access for on-demand
// cover letter generation (see CoverLetterService, which reads the résumé/memory/analysis it
// needs from the DB itself). Fetching, analysis, and the daily agent loop live in run-agent.ts;
// don't duplicate that setup here.
async function main() {
    try {
        const config = (0, config_1.validateAndLoadConfig)();
        logger_1.logger.info('Config validated', { nodeEnv: config.nodeEnv });
        (0, client_1.getPool)();
        await (0, client_1.testConnection)();
        logger_1.logger.info('Database connected');
        const claudeAnalysisService = new claude_analysis_service_1.ClaudeAnalysisService(config.claudeApiKey, config.claudeModel, config.analysisDescMaxChars);
        const coverLetterService = new cover_letter_service_1.CoverLetterService(claudeAnalysisService);
        const app = (0, app_1.createApp)(config.locationPriority, coverLetterService);
        const port = parseInt(process.env['PORT'] ?? '3001', 10);
        // The API has no auth — bind to loopback so it isn't reachable from the local network.
        const host = process.env['HOST'] ?? '127.0.0.1';
        const server = app.listen(port, host, () => {
            logger_1.logger.info(`REST API listening on ${host}:${port}`);
        });
        logger_1.logger.info('System ready');
        async function shutdown(signal) {
            logger_1.logger.info(`${signal} received — shutting down`);
            await new Promise((resolve) => server.close(() => resolve()));
            await (0, client_1.closePool)();
            process.exit(0);
        }
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (error) {
        logger_1.logger.error('Startup failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map