"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadJSearchConfig = loadJSearchConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const DEFAULTS = {
    cadence: ['mon', 'wed', 'fri'],
    datePosted: 'week',
    maxRequestsPerRun: 15,
    minReserve: 20,
    locations: ['remote', 'Seattle, WA', 'US'],
};
function loadJSearchConfig() {
    const file = path.resolve(process.cwd(), 'config/jsearch.json');
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        // Validate per field so a single wrong type can't crash the fetch loop — fall back to the
        // default for any field that's missing or malformed.
        return {
            cadence: isStringArray(parsed.cadence) ? parsed.cadence : DEFAULTS.cadence,
            datePosted: typeof parsed.datePosted === 'string' ? parsed.datePosted : DEFAULTS.datePosted,
            maxRequestsPerRun: isPositiveNumber(parsed.maxRequestsPerRun) ? parsed.maxRequestsPerRun : DEFAULTS.maxRequestsPerRun,
            minReserve: isPositiveNumber(parsed.minReserve) ? parsed.minReserve : DEFAULTS.minReserve,
            locations: isStringArray(parsed.locations) ? parsed.locations : DEFAULTS.locations,
        };
    }
    catch {
        logger_1.logger.warn('config/jsearch.json missing or invalid — using built-in JSearch defaults');
        return DEFAULTS;
    }
}
function isStringArray(v) {
    return Array.isArray(v) && v.every((x) => typeof x === 'string');
}
function isPositiveNumber(v) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}
//# sourceMappingURL=jsearch.config.js.map