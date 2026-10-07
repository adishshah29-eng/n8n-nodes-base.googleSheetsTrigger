import assert from 'node:assert/strict';
import { createPublicKey, randomUUID, verify as nodeVerify } from 'node:crypto';
import { before, test } from 'node:test';
import { attempt, call, closeDb, dbPath, enroll, get, profile, run, sync } from './helpers.js';
import { rmSync } from 'node:fs';

const { publicKeyB64url } = await import('../lib/sign.js');
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url'));

let W;
before(async () => {
  W = await enroll('Cert Worker', { photo: 'data:image/png;base64,AAAA' });
});

test('a passing attempt yields a certificate whose signature verifies with the public key', async () => {
  const r = await sync(W.deviceToken, [attempt()]);
  const { id, token } = r.body.certificates[0];
  const [payload, sig] = token.split('.');
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKeyB64url(), 'base64url')]);
  assert.ok(nodeVerify(null, Buffer.from(payload), createPublicKey({ key: spki, format: 'der', type: 'spki' }), Buffer.from(sig, 'base64url')));
  const body = payloadOf(token);
  assert.equal(body.c, id);
  assert.equal(body.w, W.id);
  assert.deepEqual(body.sc, ['fire-panel']);
  assert.ok(body.e > body.i);
  assert.ok(token.length < 400, 'QR-friendly');
});

test('retrying the sync returns the same certificate', async () => {
  const a = attempt();
  const first = await sync(W.deviceToken, [a]);
  const again = await sync(W.deviceToken, [a]);
  assert.equal(again.body.certificates[0].id, first.body.certificates[0].id);
  assert.equal(get('SELECT count(*) AS n FROM certificates WHERE worker_id = ?', W.id).n, 1);
});

test('failed attempts earn no certificate', async () => {
  const w = await enroll('Fails');
  const r = await sync(w.deviceToken, [attempt({ passed: false, criticalFail: true, score: 0 })]);
  assert.deepEqual(r.body.certificates, []);
});

test('implausible passes are stored, flagged and earn nothing', async () => {
  const w = await enroll('Cheat');
  const fast = attempt({ steps: [{ stepId: 's2', optionId: 'alarm', decisionMs: 200, tries: 1 }, { stepId: 's3', decisionMs: 5000, tries: 1 }] });
  const missing = attempt({ steps: [{ stepId: 's2', optionId: 'alarm', decisionMs: 2000, tries: 1 }] });
  const unknown = attempt({ scenarioId: 'no-such-scenario' });
  const r = await sync(w.deviceToken, [fast, missing, unknown]);
  assert.equal(r.body.synced.length, 3);
  assert.equal(r.body.flagged.length, 3);
  assert.deepEqual(r.body.certificates, []);
});

test('status is public and shows the worker identity', async () => {
  const { id } = (await sync(W.deviceToken, [attempt()])).body.certificates[0];
  const r = await call('GET', `certificates/${id}/status`);
  assert.equal(r.code, 200);
  assert.equal(r.body.valid, true);
  assert.equal(r.body.worker.name, 'Cert Worker');
  assert.equal(r.body.worker.photo, 'data:image/png;base64,AAAA');
  assert.deepEqual(r.body.scenarios, ['fire-panel']);
  assert.equal((await call('GET', `certificates/${randomUUID()}/status`)).code, 404);
  assert.equal((await call('GET', 'certificates/x/status')).code, 404);
});

test('revocation shows on the status and is not undone by re-syncing', async () => {
  const w = await enroll('Revoked');
  const a = attempt();
  const { id } = (await sync(w.deviceToken, [a])).body.certificates[0];
  run('UPDATE certificates SET revoked_at = ? WHERE id = ?', new Date().toISOString(), id);
  const st = await call('GET', `certificates/${id}/status`);
  assert.deepEqual([st.body.valid, st.body.revoked], [false, true]);
  assert.deepEqual((await sync(w.deviceToken, [a])).body.certificates, []);
});

test('a second scenario pass issues a certificate listing both', async () => {
  const w = await enroll('Two');
  await sync(w.deviceToken, [attempt()]);
  run(`INSERT INTO attempts (id, worker_id, scenario_id, score, passed, steps, duration_ms, device_time, received_at)
       VALUES (?, ?, 'conveyor-loto', 80, 1, '[]', 30000, ?, ?)`, randomUUID(), w.id, new Date().toISOString(), new Date().toISOString());
  const r = await sync(w.deviceToken, [attempt()]);
  assert.deepEqual(payloadOf(r.body.certificates[0].token).sc, ['conveyor-loto', 'fire-panel']);
});

test('GET certificates/:id only for the owner', async () => {
  const { id } = (await sync(W.deviceToken, [attempt()])).body.certificates[0];
  const other = await enroll('Other');
  assert.equal((await call('GET', `certificates/${id}`, { token: W.deviceToken })).code, 200);
  assert.equal((await call('GET', `certificates/${id}`, { token: other.deviceToken })).code, 404);
  assert.equal((await call('GET', `certificates/${id}`)).code, 401);
});

test('server storage reset: the phone restores worker, certificate and attempts on its next sync', async () => {
  const w = await enroll('Restore Me');
  const a = attempt();
  const { id, token } = (await sync(w.deviceToken, [a], { worker: profile('Restore Me') })).body.certificates[0];

  // the serverless instance restarts with an empty /tmp
  closeDb();
  for (const f of ['', '-wal', '-shm']) rmSync(dbPath() + f, { force: true });
  assert.equal((await call('GET', `certificates/${id}/status`)).code, 404);

  // the old device token still works (it is signed, not looked up)
  const hello = await sync(w.deviceToken, [], { worker: profile('Restore Me'), certificates: [token] });
  assert.equal(hello.code, 200);
  assert.equal(hello.body.resend, true, 'server asks the phone to re-send everything');
  const st = await call('GET', `certificates/${id}/status`);
  assert.equal(st.body.valid, true);
  assert.equal(st.body.worker.name, 'Restore Me');

  const again = await sync(w.deviceToken, [a], { worker: profile('Restore Me'), certificates: [token] });
  assert.equal(again.body.resend, false, 'only once');
  assert.deepEqual(again.body.synced, [a.id]);
  assert.equal(again.body.certificates[0].id, id, 'the same certificate, not a new one');
  assert.equal(get('SELECT count(*) AS n FROM certificates WHERE worker_id = ?', w.id).n, 1);
});

test('restoring certificates accepts only our own signatures, for this worker', async () => {
  const w = await enroll('Honest');
  const mine = (await sync(w.deviceToken, [attempt()])).body.certificates[0].token;
  const other = await enroll('Thief');
  // someone else's genuine certificate: not restored for the thief
  await sync(other.deviceToken, [], { certificates: [mine] });
  assert.equal(get('SELECT worker_id FROM certificates WHERE id = ?', payloadOf(mine).c).worker_id, w.id);
  // a certificate naming the thief but not signed by our key: rejected
  const forgedPayload = Buffer.from(JSON.stringify({ c: randomUUID(), w: other.id, sc: ['fire-panel'], s: 100, i: 1, e: 9e9 })).toString('base64url');
  const forged = `${forgedPayload}.${'A'.repeat(86)}`;
  await sync(other.deviceToken, [], { certificates: [forged, 'garbage'] });
  assert.equal(get('SELECT count(*) AS n FROM certificates WHERE worker_id = ?', other.id).n, 0);
});
