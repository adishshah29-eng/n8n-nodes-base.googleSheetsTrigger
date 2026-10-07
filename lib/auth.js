import { createHash } from 'node:crypto';
import { pool } from './db.js';

/** Resolves the worker for a `Bearer <deviceToken>` header, or null. */
export async function workerFromRequest(req) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? '');
  if (!m) return null;
  const hash = createHash('sha256').update(m[1]).digest('hex');
  const { rows } = await pool.query('SELECT id FROM workers WHERE device_token_hash = $1', [hash]);
  return rows[0] ?? null;
}
