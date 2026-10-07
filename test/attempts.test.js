import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import { attempt, call, enroll, get, sync } from './helpers.js';

let A, B;
before(async () => {
  A = await enroll('A');
  B = await enroll('B');
});

test('rejects missing, unknown and forged device tokens', async () => {
  assert.equal((await call('POST', 'attempts', { body: { attempts: [attempt()] } })).code, 401);
  assert.equal((await sync('garbage', [attempt()])).code, 401);
  const forged = `v1.${randomUUID()}.${'A'.repeat(43)}`;
  assert.equal((await sync(forged, [attempt()])).code, 401);
  const other = A.deviceToken.replace(A.id, B.id); // B's id with A's signature
  assert.equal((await sync(other, [attempt()])).code, 401);
});

test('method and batch size checks; an empty batch is a valid "hello" sync', async () => {
  assert.equal((await call('GET', 'attempts')).code, 405);
  assert.equal((await sync(A.deviceToken, Array.from({ length: 51 }, () => attempt()))).code, 400);
  assert.equal((await call('POST', 'attempts', { body: { attempts: 'x' }, token: A.deviceToken })).code, 400);
  const hello = await sync(A.deviceToken, []);
  assert.equal(hello.code, 200);
  assert.deepEqual(hello.body.synced, []);
});

test('stores attempts and is idempotent on retry (received_at is kept)', async () => {
  const a = attempt();
  const r1 = await sync(A.deviceToken, [a]);
  assert.deepEqual(r1.body.synced, [a.id]);
  const first = get('SELECT received_at, worker_id FROM attempts WHERE id = ?', a.id);
  assert.equal(first.worker_id, A.id);
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual((await sync(A.deviceToken, [a])).body.synced, [a.id]);
  assert.equal(get('SELECT count(*) AS n FROM attempts WHERE id = ?', a.id).n, 1);
  assert.equal(get('SELECT received_at FROM attempts WHERE id = ?', a.id).received_at, first.received_at);
});

test("upsert updates the same worker's attempt", async () => {
  const a = attempt({ score: 30, passed: false });
  await sync(A.deviceToken, [a]);
  await sync(A.deviceToken, [{ ...a, score: 70, passed: true }]);
  const row = get('SELECT score, passed FROM attempts WHERE id = ?', a.id);
  assert.deepEqual([row.score, row.passed], [70, 1]);
});

test('another worker cannot overwrite an attempt', async () => {
  const a = attempt();
  await sync(A.deviceToken, [a]);
  const r = await sync(B.deviceToken, [{ ...a, score: 999 }]);
  assert.deepEqual(r.body.synced, []);
  assert.equal(r.body.rejected[0].error, 'id belongs to another worker');
  assert.equal(get('SELECT score FROM attempts WHERE id = ?', a.id).score, 70);
});

test('mixed batch: valid ones stored, invalid ones rejected', async () => {
  const good = attempt();
  const bad = attempt({ score: -5 });
  const r = await sync(A.deviceToken, [good, bad, { id: 'nope' }]);
  assert.deepEqual(r.body.synced, [good.id]);
  assert.equal(r.body.rejected.length, 2);
  assert.equal(get('SELECT count(*) AS n FROM attempts WHERE id = ?', bad.id).n, 0);
});
