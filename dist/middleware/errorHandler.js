"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, _next) {
    logger_1.logger.error('Unhandled route error', { error: err.message, path: req.path });
    res.status(500).json({ success: false, error: 'Internal server error' });
}
//# sourceMappingURL=errorHandler.js.map