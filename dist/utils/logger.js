"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
// Patterns that must never appear in log output
const SENSITIVE_PATTERNS = [
    /sk-ant-[A-Za-z0-9_-]+/g, // Claude API keys
    /SG\.[A-Za-z0-9_.-]+/g, // SendGrid keys
    /postgresql:\/\/[^@]+@/g, // DB credentials in URL
    /password["']?\s*[:=]\s*["']?\S+/gi,
    /api[_-]?key["']?\s*[:=]\s*["']?\S+/gi,
];
function redactSensitive(value) {
    let redacted = value;
    for (const pattern of SENSITIVE_PATTERNS) {
        redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
}
function sanitizeContext(context) {
    const sanitized = {};
    for (const [key, value] of Object.entries(context)) {
        if (typeof value === 'string') {
            sanitized[key] = redactSensitive(value);
        }
        else if (value instanceof Error) {
            sanitized[key] = redactSensitive(value.message);
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
function write(level, message, context) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: redactSensitive(message),
        ...(context ? { context: sanitizeContext(context) } : {}),
    };
    const output = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
        process.stderr.write(output + '\n');
    }
    else {
        process.stdout.write(output + '\n');
    }
}
exports.logger = {
    debug(message, context) {
        if (process.env['NODE_ENV'] !== 'production') {
            write('debug', message, context);
        }
    },
    info(message, context) {
        write('info', message, context);
    },
    warn(message, context) {
        write('warn', message, context);
    },
    error(message, context) {
        write('error', message, context);
    },
};
//# sourceMappingURL=logger.js.map