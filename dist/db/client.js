"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.testConnection = testConnection;
exports.closePool = closePool;
const pg_1 = require("pg");
const logger_1 = require("../utils/logger");
// OID 1114 (TIMESTAMP) has no tz info — pg interprets it as local time; force UTC.
pg_1.types.setTypeParser(1114, (val) => new Date(val + '+0000'));
let pool = null;
function getPool() {
    if (!pool) {
        const connectionString = process.env['DATABASE_URL'];
        if (!connectionString) {
            throw new Error('DATABASE_URL is not set — call validateAndLoadConfig() first');
        }
        pool = new pg_1.Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => {
            logger_1.logger.error('Unexpected PostgreSQL pool error', { error: err.message });
        });
    }
    return pool;
}
async function testConnection() {
    const client = await getPool().connect();
    try {
        await client.query('SELECT 1');
    }
    finally {
        client.release();
    }
}
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        logger_1.logger.info('Database pool closed');
    }
}
//# sourceMappingURL=client.js.map