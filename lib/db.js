import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

// Serverless: one connection per function instance. Use a pooled connection
// string (e.g. Neon / Vercel Postgres "pooled") in DATABASE_URL.
const g = globalThis;
export const pool = (g.__aotanPool ??= new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 8000, // fail with a clear error instead of hanging until the function times out
}));

const MIGRATIONS = new URL('../db/migrations/', import.meta.url);
const LOCK = 727274; // any constant: serialises migrations across function instances

/**
 * Applies pending SQL migrations (db/migrations/*.sql, in name order, each once). Safe to run from many
 * serverless instances at once: a Postgres advisory lock lets one apply them while the others wait.
 * Returns the names applied by this call.
 */
export async function migrate(client = pool) {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('DATABASE_URL is not set'), { code: 'NO_DATABASE_URL' });
  const c = await client.connect();
  const applied = [];
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK]);
    await c.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY)');
    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
    for (const name of files) {
      if ((await c.query('SELECT 1 FROM migrations WHERE name = $1', [name])).rowCount) continue;
      await c.query('BEGIN');
      try {
        await c.query(await readFile(new URL(name, MIGRATIONS), 'utf8'));
        await c.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
        await c.query('COMMIT');
        applied.push(name);
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => {});
    c.release();
  }
  return applied;
}

let readyPromise = null;
/** The schema is up to date (checked once per function instance; retried if it failed). */
export function ready() {
  readyPromise ??= migrate().catch((e) => {
    readyPromise = null;
    throw e;
  });
  return readyPromise;
}

/**
 * Turns a database or server failure into a short, safe reason (never the connection string or
 * password) so a misconfigured deployment says what is wrong instead of crashing.
 */
export function explain(e) {
  const code = e?.code;
  const msg = String(e?.message ?? '');
  if (code === 'NO_DATABASE_URL') return { status: 503, error: 'database not configured: set DATABASE_URL in the Vercel project settings' };
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET'].includes(code) || /timeout/i.test(msg))
    return { status: 503, error: 'cannot reach the database: check the host in DATABASE_URL' };
  if (code === '28P01' || code === '28000') return { status: 503, error: 'database login rejected: check the user and password in DATABASE_URL' };
  if (code === '3D000') return { status: 503, error: 'database named in DATABASE_URL does not exist' };
  if (/ssl|certificate/i.test(msg)) return { status: 503, error: 'database SSL problem: add ?sslmode=require to DATABASE_URL' };
  return { status: 500, error: 'server error' };
}

/** Wraps an API handler: makes sure the schema exists first, and reports failures as JSON. */
export function withDb(handler) {
  return async (req, res) => {
    try {
      await ready();
      return await handler(req, res);
    } catch (e) {
      const why = explain(e);
      console.error(`[api] ${req.method} ${req.url}: ${why.error}`, e);
      if (!res.headersSent) res.status(why.status).json({ error: why.error });
    }
  };
}
