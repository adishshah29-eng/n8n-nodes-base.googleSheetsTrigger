import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Storage is one SQLite file (Node's built-in node:sqlite: nothing to install or configure).
//
//  - Locally / on a normal server: data/aotan.db, kept between restarts.
//  - On Vercel: /tmp/aotan.db, the only writable place. It is wiped when the function goes idle and
//    restarts. That is acceptable here because the phone is the durable copy: every sync re-sends the
//    worker's profile, photo and certificates, and all attempts if the server had lost them
//    (see lib/handlers/attempts.js). Admin history and revocations last until the next restart.
//
// DATABASE_PATH overrides the location (tests and e2e use a temp file).

export const dbPath = () =>
  process.env.DATABASE_PATH ?? (process.env.VERCEL ? '/tmp/aotan.db' : new URL('../data/aotan.db', import.meta.url).pathname);

/** Data on this host disappears when the instance restarts (Vercel). Reported by /api/health. */
export const ephemeral = () => !process.env.DATABASE_PATH && !!process.env.VERCEL;

const MIGRATIONS = new URL('../db/migrations/', import.meta.url);
const SITES = new URL('../content/sites.json', import.meta.url);

let db = null;
const onInit = [];
/** Lets another module run once on a freshly opened database (used for demo seeding). */
export const whenOpened = (fn) => onInit.push(fn);

export function getDb() {
  if (db) return db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate(d);
  loadSites(d);
  db = d;
  for (const fn of onInit) fn(d);
  return db;
}

/** Applies db/migrations/*.sql in name order, each once (tracked with PRAGMA user_version). */
export function migrate(d = getDb()) {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  d.exec('BEGIN IMMEDIATE');
  try {
    const done = d.prepare('PRAGMA user_version').get().user_version;
    files.slice(done).forEach((f) => d.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8')));
    d.exec(`PRAGMA user_version = ${files.length}`);
    d.exec('COMMIT');
    return files.slice(done);
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/** Sites come from content/sites.json (edit it to add mines); upserted on every start, ids stay stable. */
function loadSites(d) {
  const sites = JSON.parse(readFileSync(SITES, 'utf8'));
  const up = d.prepare('INSERT INTO sites (id, name, district) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, district = excluded.district');
  for (const s of sites) up.run(s.id, s.name, s.district ?? null);
}

// node:sqlite takes only numbers, strings, null, bigint and buffers: normalise the rest.
const param = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v instanceof Date ? v.toISOString() : v);
const plain = (row) => (row ? { ...row } : row); // rows come back with a null prototype

export const all = (sql, ...p) => getDb().prepare(sql).all(...p.map(param)).map(plain);
export const get = (sql, ...p) => plain(getDb().prepare(sql).get(...p.map(param)));
export const run = (sql, ...p) => getDb().prepare(sql).run(...p.map(param));

/** Runs `fn` in a write transaction. */
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/** For tests: close the file so a new DATABASE_PATH can be opened. */
export function closeDb() {
  db?.close();
  db = null;
}

export const now = () => new Date().toISOString();

/** Short, safe reasons for server failures (never secrets). */
export function explain(e) {
  if (e?.code === 'NO_SIGNING_KEY') return { status: 503, error: 'signing key not configured: set ED25519_PRIVATE_KEY in the Vercel project settings' };
  if (/SQLITE_(CANTOPEN|READONLY|IOERR)|EROFS|EACCES/.test(`${e?.code} ${e?.message}`)) return { status: 503, error: 'storage not writable: set DATABASE_PATH to a writable file' };
  return { status: 500, error: 'server error' };
}

/** Wraps an API handler: opens the database first, and reports failures as JSON instead of crashing. */
export function withDb(handler) {
  return async (req, res) => {
    try {
      getDb();
      return await handler(req, res);
    } catch (e) {
      const why = explain(e);
      console.error(`[api] ${req.method} ${req.url}: ${why.error}`, e);
      if (!res.headersSent) res.status(why.status).json({ error: why.error });
    }
  };
}
