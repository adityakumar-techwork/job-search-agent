import { validateAndLoadConfig } from './config/config';
import { logger } from './utils/logger';
import { getPool, testConnection, closePool } from './db/client';
import { Server } from 'http';
import { createApp } from './app';
import { CoverLetterService } from './services/cover-letter.service';
import { ClaudeAnalysisService } from './services/claude-analysis.service';

// This is the REST API server for the dashboard — it only needs Claude access for on-demand
// cover letter generation (see CoverLetterService, which reads the résumé/memory/analysis it
// needs from the DB itself). Fetching, analysis, and the daily agent loop live in run-agent.ts;
// don't duplicate that setup here.

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

async function main(): Promise<void> {
  try {
    const port = parseInt(process.env['PORT'] ?? '3001', 10);
    // The API has no authentication, so it only ever listens on loopback. To reach it from another
    // machine, use an SSH tunnel (ssh -L 3001:127.0.0.1:3001 host) or put a reverse proxy that does
    // real authentication in front of it — never bind it to a LAN/public interface directly.
    const host = process.env['HOST'] ?? '127.0.0.1';
    if (!isLoopback(host)) {
      throw new Error(
        `HOST=${host} would expose the unauthenticated API beyond this machine. Use 127.0.0.1 / ::1 / localhost.`,
      );
    }

    const config = validateAndLoadConfig({ requireResume: false });
    logger.info('Config validated', { nodeEnv: config.nodeEnv });

    getPool();
    await testConnection();
    logger.info('Database connected');

    const claudeAnalysisService = new ClaudeAnalysisService(config.llmApiKey, config.llmModel, config.analysisDescMaxChars, {
      fallbackModels: config.llmFallbackModels,
      minIntervalMs: config.llmMinIntervalMs,
    });
    const coverLetterService = new CoverLetterService(claudeAnalysisService);
    const app = createApp(config.locationPriority, coverLetterService);
    const server: Server = app.listen(port, host, () => {
      logger.info(`REST API listening on ${host}:${port}`);
    });

    logger.info('System ready');
    server.ref();
    const keepAliveTimer = setInterval(() => {}, 2147483647);

    async function shutdown(signal: string): Promise<void> {
      logger.info(`${signal} received — shutting down`);
      clearInterval(keepAliveTimer);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closePool();
      process.exit(0);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Startup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
