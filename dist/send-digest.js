"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config/config");
const client_1 = require("./db/client");
const digest_service_1 = require("./services/digest.service");
const logger_1 = require("./utils/logger");
async function main() {
    const config = (0, config_1.validateAndLoadConfig)();
    await (0, client_1.testConnection)();
    logger_1.logger.info('DB connection verified — sending weekly digest');
    const digestService = new digest_service_1.DigestService(config.mailgunApiKey, config.mailgunDomain, config.mailgunBaseUrl, config.recipientEmail);
    await digestService.send();
}
main().catch((err) => {
    logger_1.logger.error('Failed to send weekly digest', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
//# sourceMappingURL=send-digest.js.map