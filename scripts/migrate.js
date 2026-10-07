import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../lib/db.js';

const dir = join(import.meta.dirname, '../db/migrations');

await pool.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY)');
for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const done = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [name]);
  if (done.rowCount) continue;
  await pool.query('BEGIN');
  try {
    await pool.query(readFileSync(join(dir, name), 'utf8'));
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
    await pool.query('COMMIT');
    console.log('applied', name);
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}
await pool.end();
