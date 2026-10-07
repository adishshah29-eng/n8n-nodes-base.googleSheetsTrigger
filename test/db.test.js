import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { call, dbPath, explain, get, getDb, migrate } from './helpers.js';

test('fresh database: schema created, sites loaded, migrations recorded', async () => {
  getDb();
  assert.equal(get('PRAGMA user_version').user_version, 1);
  assert.deepEqual(migrate(), [], 'second run applies nothing');
  assert.ok(get('SELECT count(*) AS n FROM sites').n >= 3);
});

test('health reports SQLite storage and counts', async () => {
  const r = await call('GET', 'health');
  assert.equal(r.code, 200);
  assert.equal(r.body.storage, 'sqlite');
  assert.equal(r.body.path, dbPath());
  assert.equal(typeof r.body.workers, 'number');
});

test('explain gives safe, specific reasons', () => {
  assert.match(explain({ code: 'NO_SIGNING_KEY' }).error, /ED25519_PRIVATE_KEY/);
  assert.match(explain({ code: 'ERR_SQLITE_ERROR', message: 'SQLITE_CANTOPEN: unable to open' }).error, /not writable/);
  assert.deepEqual(explain(new Error('boom /secret/path')), { status: 500, error: 'server error' });
});

test('without a signing key, enrollment answers 503 with the reason (cold instance)', () => {
  const script = `
    const { dispatch } = await import('./lib/api.js');
    const { withDb } = await import('./lib/db.js');
    const r = await new Promise((resolve) => withDb(dispatch)({ method: 'POST', url: '/api/workers', headers: {},
      body: { name: 'a', employerId: 'b', lang: 'en', photo: 'data:image/jpeg;base64,AAAA' } },
      { headersSent: false, setHeader() {}, status(c) { this.c = c; return this; }, json(o) { resolve({ code: this.c, body: o }); } }));
    console.log(JSON.stringify(r));`;
  const env = { ...process.env, DATABASE_PATH: dbPath() + '.nokey' };
  delete env.ED25519_PRIVATE_KEY;
  const out = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], { env, cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const r = JSON.parse(out.stdout.trim().split('\n').pop());
  assert.equal(r.code, 503);
  assert.match(r.body.error, /ED25519_PRIVATE_KEY/);
});
