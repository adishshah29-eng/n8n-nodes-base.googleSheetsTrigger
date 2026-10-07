// Integration test: needs DATABASE_URL (migrated, disposable) and runs with a throwaway signing key.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, verify as nodeVerify, createPublicKey } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ed25519');
process.env.ED25519_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

const { after, before, test } = await import('node:test');
const { pool } = await import('../lib/db.js');
const { default: attemptsHandler } = await import('../api/attempts.js');
const { default: workersHandler } = await import('../api/workers.js');
const { default: certHandler } = await import('../api/certificates/[id]/index.js');
const { default: statusHandler } = await import('../api/certificates/[id]/status.js');
const { publicKeyB64url } = await import('../lib/sign.js');

const call = (handler, { method = 'POST', body, headers = {}, query = {} } = {}) =>
  new Promise((resolve, reject) => {
    const res = {
      code: 200, setHeader() {},
      status(c) { this.code = c; return this; },
      json(o) { resolve({ code: this.code, body: o }); },
    };
    Promise.resolve(handler({ method, body, headers, query }, res)).catch(reject);
  });

const attempt = (over = {}) => ({
  id: randomUUID(), scenarioId: 'fire-panel', score: 70, passed: true, criticalFail: false,
  steps: [
    { stepId: 's2', optionId: 'alarm', decisionMs: 2000, tries: 1 },
    { stepId: 's3', decisionMs: 5000, tries: 1 },
  ],
  durationMs: 30000, deviceTime: new Date().toISOString(), ...over,
});

let worker;
const auth = (w = worker) => ({ authorization: `Bearer ${w.deviceToken}` });
const sync = (attempts, w = worker) => call(attemptsHandler, { body: { attempts }, headers: auth(w) });
const enroll = async (name) => (await call(workersHandler, { body: { name, employerId: 'E9', lang: 'sat', photo: 'data:image/png;base64,AAAA' } })).body;

before(async () => { worker = await enroll('Cert Worker'); });
after(() => pool.end());

test('a passing attempt yields a certificate whose signature verifies', async () => {
  const r = await sync([attempt()]);
  assert.equal(r.body.certificates.length, 1);
  const { id, token } = r.body.certificates[0];
  const [payload, sig] = token.split('.');
  const pub = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(publicKeyB64url(), 'base64url'),
  ]);
  assert.ok(nodeVerify(null, Buffer.from(payload), createPublicKey({ key: pub, format: 'der', type: 'spki' }), Buffer.from(sig, 'base64url')));
  const body = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(body.c, id);
  assert.equal(body.w, worker.id);
  assert.deepEqual(body.sc, ['fire-panel']);
  assert.ok(body.e > body.i);
  assert.ok(token.length < 400, 'token must stay QR-friendly');
});

test('retrying the sync returns the same certificate, not a new one', async () => {
  const a = attempt({ scenarioId: 'fire-panel' });
  const first = await sync([a]);
  const again = await sync([a]);
  assert.equal(again.body.certificates[0].id, first.body.certificates[0].id);
  const n = (await pool.query('SELECT count(*)::int AS n FROM certificates WHERE worker_id=$1', [worker.id])).rows[0].n;
  assert.equal(n, 1);
});

test('failed attempts earn no certificate', async () => {
  const w = await enroll('Fails');
  const r = await sync([attempt({ passed: false, criticalFail: true, score: 0 })], w);
  assert.deepEqual(r.body.certificates, []);
});

test('implausible passes are stored, flagged and earn nothing', async () => {
  const w = await enroll('Cheat');
  const fast = attempt({ steps: [
    { stepId: 's2', optionId: 'alarm', decisionMs: 200, tries: 1 },
    { stepId: 's3', decisionMs: 5000, tries: 1 },
  ] });
  const missing = attempt({ steps: [{ stepId: 's2', optionId: 'alarm', decisionMs: 2000, tries: 1 }] });
  const unknown = attempt({ scenarioId: 'no-such-scenario' });
  const r = await sync([fast, missing, unknown], w);
  assert.equal(r.body.synced.length, 3);
  assert.equal(r.body.flagged.length, 3);
  assert.deepEqual(r.body.certificates, []);
  const { rows } = await pool.query('SELECT flag FROM attempts WHERE worker_id=$1', [w.id]);
  assert.equal(rows.filter((x) => x.flag).length, 3);
});

test('status endpoint is public and reports worker identity', async () => {
  const { id } = (await sync([attempt()])).body.certificates[0];
  const r = await call(statusHandler, { method: 'GET', query: { id } });
  assert.equal(r.code, 200);
  assert.equal(r.body.valid, true);
  assert.equal(r.body.worker.name, 'Cert Worker');
  assert.equal(r.body.worker.photo, 'data:image/png;base64,AAAA');
  assert.equal((await call(statusHandler, { method: 'GET', query: { id: randomUUID() } })).code, 404);
  assert.equal((await call(statusHandler, { method: 'GET', query: { id: 'x' } })).code, 404);
});

test('revocation flips status and is not undone by re-syncing', async () => {
  const w = await enroll('Revoked');
  const a = attempt();
  const { id } = (await sync([a], w)).body.certificates[0];
  await pool.query('UPDATE certificates SET revoked_at = now() WHERE id=$1', [id]);
  const st = await call(statusHandler, { method: 'GET', query: { id } });
  assert.equal(st.body.valid, false);
  assert.equal(st.body.revoked, true);
  const again = await sync([a], w); // retry of the same, already-stored attempt
  assert.deepEqual(again.body.certificates, []);
});

test('a new scenario pass issues a certificate listing both', async () => {
  const w = await enroll('Two');
  await sync([attempt()], w);
  // second scenario has no definition on disk -> implausible, so use the same one to check no dup;
  // multi-scenario aggregation is covered by inserting a plausible attempt row directly
  await pool.query(
    `INSERT INTO attempts (id, worker_id, scenario_id, score, passed, steps, duration_ms, device_time)
     VALUES ($1,$2,'conveyor-loto',80,true,'[]',30000,now())`, [randomUUID(), w.id]);
  const r = await sync([attempt()], w);
  const body = JSON.parse(Buffer.from(r.body.certificates[0].token.split('.')[0], 'base64url'));
  assert.deepEqual(body.sc, ['conveyor-loto', 'fire-panel']);
});

test('GET /api/certificates/:id is limited to the owner', async () => {
  const { id } = (await sync([attempt()])).body.certificates[0];
  const other = await enroll('Other');
  assert.equal((await call(certHandler, { method: 'GET', query: { id }, headers: auth() })).code, 200);
  assert.equal((await call(certHandler, { method: 'GET', query: { id }, headers: auth(other) })).code, 404);
  assert.equal((await call(certHandler, { method: 'GET', query: { id } })).code, 401);
});
