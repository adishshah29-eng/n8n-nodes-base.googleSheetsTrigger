// Needs DATABASE_URL (local, disposable) for the migration test; the rest are pure.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { explain, migrate, pool, withDb } from '../lib/db.js';
import healthHandler from '../api/health.js';

after(() => pool.end());

const call = (handler, url = '/x') => new Promise((resolve) => {
  const res = { code: 200, headersSent: false, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
  handler({ method: 'GET', url, headers: {}, query: {} }, res);
});

test('explain gives safe, specific reasons and never echoes the connection string', () => {
  const secret = 'postgres://admin:hunter2@db.example.com/prod';
  const cases = [
    [{ code: 'NO_DATABASE_URL' }, 503, /not configured/],
    [{ code: 'ENOTFOUND', message: `getaddrinfo ENOTFOUND ${secret}` }, 503, /cannot reach/],
    [{ code: '28P01', message: `password authentication failed ${secret}` }, 503, /login rejected/],
    [{ code: '3D000' }, 503, /does not exist/],
    [{ message: 'The server does not support SSL connections' }, 503, /SSL/],
    [{ message: `boom ${secret}` }, 500, /^server error$/],
  ];
  for (const [e, status, re] of cases) {
    const r = explain(e);
    assert.equal(r.status, status);
    assert.match(r.error, re);
    assert.ok(!r.error.includes('hunter2') && !r.error.includes('db.example.com'));
  }
});

test('migrate is idempotent and the health check reports the schema', async () => {
  await migrate();
  assert.deepEqual(await migrate(), [], 'second run applies nothing');
  const r = await call(healthHandler, '/api/health?db=1');
  assert.equal(r.code, 200);
  assert.equal(r.body.db, 'ok');
  assert.ok(r.body.migrations >= 2);
});

test('concurrent first requests do not race the migrations', async () => {
  await Promise.all([migrate(), migrate(), migrate()]);
});

test('without DATABASE_URL, a cold instance answers 503 with the reason instead of crashing', () => {
  // A fresh process = a cold serverless instance (the schema check is cached once it has passed).
  const script = `
    const { withDb } = await import('./lib/db.js');
    const { default: health } = await import('./api/health.js');
    const call = (h, url) => new Promise((resolve) => h({ method: 'GET', url, headers: {}, query: {} },
      { headersSent: false, setHeader() {}, status(c) { this.c = c; return this; }, json(o) { resolve({ code: this.c, body: o }); } }));
    const a = await call(withDb(async () => { throw new Error('handler must not run'); }), '/api/workers');
    const b = await call(health, '/api/health?db=1');
    console.log(JSON.stringify({ a, b }));`;
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const { a, b } = JSON.parse(out.stdout.trim().split('\n').pop());
  assert.equal(a.code, 503);
  assert.match(a.body.error, /DATABASE_URL/);
  assert.equal(b.code, 503);
  assert.equal(b.body.ok, false);
});
