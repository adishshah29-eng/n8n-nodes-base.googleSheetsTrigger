// Integration test: needs DATABASE_URL pointing at a migrated, disposable database.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { pool } from '../lib/db.js';
import attemptsHandler from '../api/attempts.js';
import workersHandler from '../api/workers.js';

const call = (handler, { method = 'POST', body, headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const res = {
      code: 200,
      setHeader() {},
      status(c) { this.code = c; return this; },
      json(o) { resolve({ code: this.code, body: o }); },
    };
    Promise.resolve(handler({ method, body, headers }, res)).catch(reject);
  });

const attempt = (over = {}) => ({
  id: randomUUID(), scenarioId: 'fire-panel', score: 70, passed: true, criticalFail: false,
  steps: [
    { stepId: 's2', optionId: 'alarm', decisionMs: 2000, tries: 1 },
    { stepId: 's3', decisionMs: 5000, tries: 1 },
  ],
  durationMs: 30000, deviceTime: new Date().toISOString(), ...over,
});

let tokenA, tokenB, idA;
const enroll = async (name) => {
  const r = await call(workersHandler, { body: { name, employerId: 'E1', lang: 'sat' } });
  assert.equal(r.code, 201);
  return r.body;
};
const sync = (token, attempts) =>
  call(attemptsHandler, { body: { attempts }, headers: { authorization: `Bearer ${token}` } });

before(async () => {
  // the signing key is read lazily, so setting it here is early enough
  process.env.ED25519_PRIVATE_KEY = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const a = await enroll('A'); tokenA = a.deviceToken; idA = a.id;
  tokenB = (await enroll('B')).deviceToken;
});
after(() => pool.end());

test('rejects missing or unknown tokens', async () => {
  assert.equal((await call(attemptsHandler, { body: { attempts: [attempt()] } })).code, 401);
  assert.equal((await sync('0'.repeat(64), [attempt()])).code, 401);
});

test('rejects non-POST and bad batches', async () => {
  assert.equal((await call(attemptsHandler, { method: 'GET' })).code, 405);
  assert.equal((await sync(tokenA, [])).code, 400);
  assert.equal((await sync(tokenA, Array.from({ length: 51 }, attempt))).code, 400);
});

test('stores attempts and is idempotent on retry', async () => {
  const a = attempt();
  const r1 = await sync(tokenA, [a]);
  assert.deepEqual(r1.body.synced, [a.id]);
  assert.deepEqual(r1.body.rejected, []);
  const before = (await pool.query('SELECT received_at FROM attempts WHERE id=$1', [a.id])).rows[0];
  const r2 = await sync(tokenA, [a]);
  assert.deepEqual(r2.body.synced, [a.id]);
  const rows = (await pool.query('SELECT * FROM attempts WHERE id=$1', [a.id])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].worker_id, idA);
  assert.equal(rows[0].received_at.getTime(), before.received_at.getTime());
});

test('upsert updates the same worker\'s attempt', async () => {
  const a = attempt({ score: 30, passed: false });
  await sync(tokenA, [a]);
  await sync(tokenA, [{ ...a, score: 70, passed: true }]);
  const { rows } = await pool.query('SELECT score, passed FROM attempts WHERE id=$1', [a.id]);
  assert.deepEqual(rows[0], { score: 70, passed: true });
});

test('another worker cannot overwrite an attempt', async () => {
  const a = attempt();
  await sync(tokenA, [a]);
  const r = await sync(tokenB, [{ ...a, score: 999 }]);
  assert.deepEqual(r.body.synced, []);
  assert.equal(r.body.rejected[0].error, 'id belongs to another worker');
  assert.equal((await pool.query('SELECT score FROM attempts WHERE id=$1', [a.id])).rows[0].score, 70);
});

test('mixed batch: valid ones stored, invalid ones rejected', async () => {
  const good = attempt();
  const bad = attempt({ score: -5 });
  const r = await sync(tokenA, [good, bad, { id: 'nope' }]);
  assert.deepEqual(r.body.synced, [good.id]);
  assert.equal(r.body.rejected.length, 2);
  assert.equal((await pool.query('SELECT 1 FROM attempts WHERE id=$1', [bad.id])).rowCount, 0);
});
