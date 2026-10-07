// Integration test: needs DATABASE_URL (migrated, disposable).
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../lib/db.js';
import sitesHandler from '../api/sites.js';
import workersHandler from '../api/workers.js';

const call = (handler, { method = 'POST', body } = {}) =>
  new Promise((resolve, reject) => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    Promise.resolve(handler({ method, body, headers: {}, query: {} }, res)).catch(reject);
  });
const ok = { name: 'Sunil', employerId: 'E1', lang: 'sat', photo: 'data:image/jpeg;base64,/9j/AAAA' };
after(() => pool.end());

test('enrolls with a photo and returns a device token', async () => {
  const r = await call(workersHandler, { body: ok });
  assert.equal(r.code, 201);
  assert.match(r.body.deviceToken, /^[0-9a-f]{64}$/);
});

test('requires a valid photo', async () => {
  for (const photo of [undefined, '', 'http://evil/x.png', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(400_001)]) {
    const r = await call(workersHandler, { body: { ...ok, photo } });
    assert.equal(r.code, 400, String(photo).slice(0, 30));
  }
});

test('rejects a non-integer siteId, accepts a real one', async () => {
  assert.equal((await call(workersHandler, { body: { ...ok, siteId: 'x' } })).code, 400);
  const { rows } = await pool.query("INSERT INTO sites (name, district) VALUES ('Test mine', 'Mayurbhanj') RETURNING id");
  assert.equal((await call(workersHandler, { body: { ...ok, siteId: rows[0].id } })).code, 201);
});

test('lists sites', async () => {
  const r = await call(sitesHandler, { method: 'GET' });
  assert.equal(r.code, 200);
  assert.ok(r.body.sites.some((s) => s.name === 'Test mine'));
  assert.equal((await call(sitesHandler)).code, 405);
});
