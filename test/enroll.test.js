import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, PHOTO } from './helpers.js';

const ok = { name: 'Sunil', employerId: 'E1', lang: 'sat', photo: PHOTO };

test('enrolls with a photo and returns a signed device token', async () => {
  const r = await call('POST', 'workers', { body: ok });
  assert.equal(r.code, 201);
  assert.match(r.body.deviceToken, new RegExp(`^v1\\.${r.body.id}\\.[A-Za-z0-9_-]{43}$`));
});

test('requires a valid photo', async () => {
  for (const photo of [undefined, '', 'http://evil/x.png', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(400_001)]) {
    assert.equal((await call('POST', 'workers', { body: { ...ok, photo } })).code, 400, String(photo).slice(0, 30));
  }
});

test('validates name, employer, language and site', async () => {
  for (const bad of [{ name: '' }, { employerId: ' ' }, { lang: 'xx' }, { siteId: 'x' }]) {
    assert.equal((await call('POST', 'workers', { body: { ...ok, ...bad } })).code, 400, JSON.stringify(bad));
  }
  assert.equal((await call('POST', 'workers', { body: { ...ok, siteId: 2 } })).code, 201);
  assert.equal((await call('GET', 'workers')).code, 405);
});

test('sites come from content/sites.json', async () => {
  const r = await call('GET', 'sites');
  assert.equal(r.code, 200);
  assert.ok(r.body.sites.some((s) => s.id === 1 && s.name === 'Gua Iron Ore Mine'));
  assert.equal((await call('POST', 'sites')).code, 405);
});

test('unknown API routes are a JSON 404', async () => {
  const r = await call('GET', 'nope');
  assert.equal(r.code, 404);
  assert.match(r.body.error, /no API route/);
});
