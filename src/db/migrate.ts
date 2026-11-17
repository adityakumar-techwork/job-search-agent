import * as fs from 'fs';
import * as path from 'path';
import { getPool, closePool } from './client';
import { logger } from '../utils/logger';
import '../config/config'; // loads .env.local / .env so DATABASE_URL is available

// Applies src/db/schema.sql. Every statement in it is idempotent (CREATE ... IF NOT EXISTS), so this
// is safe to run before every agent run — that's how a fresh hosted database gets its tables.
async function main(): Promise<void> {
  // Works under ts-node (src/db) and from a tsc build (dist/db has no .sql, so fall back to src/).
  const candidates = [path.resolve(__dirname, 'schema.sql'), path.resolve(process.cwd(), 'src/db/schema.sql')];
  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) throw new Error(`schema.sql not found (looked in ${candidates.join(', ')})`);
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    logger.info('Database schema is up to date');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    logger.error('Schema migration failed', { error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  })
  .finally(() => closePool());
