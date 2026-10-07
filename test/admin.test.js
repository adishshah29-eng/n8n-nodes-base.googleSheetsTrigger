// Integration test: needs DATABASE_URL (migrated, disposable).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

process.env.ADMIN_PASSWORD = 'correct horse';
process.env.ADMIN_JWT_SECRET = 'test-secret-test-secret-test-secret';

const { pool } = await import('../lib/db.js');
const { handleAdmin } = await import('../lib/admin/router.js');
const { signJwt, verifyJwt } = await import('../lib/admin/jwt.js');
const { row, cell } = await import('../lib/admin/csv.js');
const { wrongFirstChoices } = await import('../lib/admin/stats.js');
const { default: statusHandler } = await import('../api/certificates/[id]/status.js');

const call = (path, { method = 'GET', body, token } = {}) =>
  new Promise((resolve, reject) => {
    const res = {
      code: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.code = c; return this; },
      json(o) { resolve({ code: this.code, body: o }); },
      send(t) { resolve({ code: this.code, body: t, headers: this.headers }); },
    };
    const req = { method, url: `/api/admin/${path}`, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
    Promise.resolve(handleAdmin(req, res)).catch(reject);
  });

// This file TRUNCATES tables. Refuse to run against anything that is not a local database.
{
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://x@nowhere/db').hostname;
  if (!['localhost', '127.0.0.1', '::1', ''].includes(host)) {
    throw new Error(`admin tests truncate tables; refusing to run against "${host}". Use a local, disposable database.`);
  }
}

let token, siteA, siteB, w1, w2, cert1;
const steps = (first, rest = []) => [{ stepId: 's2', optionId: rest.at(-1) ?? first, choices: [first, ...rest], decisionMs: 3000, tries: 1 + rest.length }];
const addAttempt = (worker, scenario, { passed, critical = false, score = passed ? 70 : 0, first = 'alarm', rest = [], flag = null, at = new Date() }) =>
  pool.query(
    `INSERT INTO attempts (id, worker_id, scenario_id, score, passed, critical_fail, steps, duration_ms, device_time, received_at, flag)
     VALUES ($1,$2,$3,$4,$5,$6,$7,30000,$8,$8,$9)`,
    [randomUUID(), worker, scenario, score, passed, critical, JSON.stringify(steps(first, rest)), at, flag]);

before(async () => {
  await pool.query('TRUNCATE attempts, certificates, workers, sites RESTART IDENTITY CASCADE');
  siteA = (await pool.query("INSERT INTO sites (name) VALUES ('Mine A') RETURNING id")).rows[0].id;
  siteB = (await pool.query("INSERT INTO sites (name) VALUES ('Mine B') RETURNING id")).rows[0].id;
  const mk = async (name, site) => (await pool.query(
    "INSERT INTO workers (name, employer_id, site_id, lang, photo_url, device_token_hash) VALUES ($1,'E',$2,'en','data:image/png;base64,AAAA',$3) RETURNING id",
    [name, site, randomUUID()])).rows[0].id;
  w1 = await mk('=HYPERLINK(\"evil\")', siteA); // hostile name, for the CSV test
  w2 = await mk('Bina', siteB);
  // fire-panel at site A: water, water, run->alarm, alarm  (2 critical fails, 1 pass after a wrong try, 1 clean pass)
  await addAttempt(w1, 'fire-panel', { passed: false, critical: true, first: 'water' });
  await addAttempt(w1, 'fire-panel', { passed: false, critical: true, first: 'water' });
  await addAttempt(w1, 'fire-panel', { passed: true, first: 'run', rest: ['alarm'] });
  await addAttempt(w1, 'fire-panel', { passed: true, first: 'alarm' });
  // site B, conveyor; plus one flagged "pass" that must not count
  await addAttempt(w2, 'conveyor-loto', { passed: true, score: 100, first: 'stop' });
  await addAttempt(w2, 'fire-panel', { passed: true, flag: 'step s2 too fast' });
  cert1 = randomUUID();
  await pool.query(
    "INSERT INTO certificates (id, worker_id, scenarios, score, issued_at, expires_at, signature, payload) VALUES ($1,$2,'{fire-panel}',70,now(),now() + interval '1 year','sig','pay')", [cert1, w1]);
  await pool.query(
    "INSERT INTO certificates (id, worker_id, scenarios, score, issued_at, expires_at, signature, payload) VALUES ($1,$2,'{conveyor-loto}',100,now() - interval '2 years',now() - interval '1 year','sig','pay')", [randomUUID(), w2]);
});
after(() => pool.end());

test('jwt: signs, verifies, and rejects tampering, expiry and alg=none', () => {
  const t = signJwt({ role: 'admin' }, 's', 60, 0);
  assert.equal(verifyJwt(t, 's', 1000)?.role, 'admin');
  assert.equal(verifyJwt(t, 'other', 1000), null);
  assert.equal(verifyJwt(t, 's', 61_000), null, 'expired');
  const [h, p, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ role: 'admin', exp: 9e9 })).toString('base64url');
  assert.equal(verifyJwt(`${h}.${forged}.${sig}`, 's', 1000), null, 'tampered payload');
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.equal(verifyJwt(`${none}.${p}.`, 's', 1000), null, 'alg none');
});

test('login: wrong password 401, right password gives a token', async () => {
  assert.equal((await call('login', { method: 'POST', body: { password: 'nope' } })).code, 401);
  assert.equal((await call('login', { method: 'POST', body: {} })).code, 401);
  assert.equal((await call('login', { method: 'GET' })).code, 405);
  const ok = await call('login', { method: 'POST', body: { password: 'correct horse' } });
  assert.equal(ok.code, 200);
  token = ok.body.token;
});

test('every other route needs the token', async () => {
  for (const p of ['overview', 'attempts', 'workers', 'certificates', 'export.csv']) {
    assert.equal((await call(p)).code, 401, p);
    assert.equal((await call(p, { token: 'garbage' })).code, 401, p);
  }
  assert.equal((await call('nope', { token })).code, 404);
});

test('overview: pass rates exclude flagged attempts; wrong first choices ranked', async () => {
  const r = (await call('overview', { token })).body;
  const fire = r.scenarios.find((s) => s.scenario_id === 'fire-panel');
  assert.deepEqual([fire.attempts, fire.passed, fire.critical], [4, 2, 2]);
  assert.equal(fire.passRate, 0.5);
  assert.equal(r.totals.flaggedAttempts, 1);
  const top = r.wrongFirstChoices[0];
  assert.deepEqual([top.scenarioId, top.stepId, top.optionId, top.count, top.reached], ['fire-panel', 's2', 'water', 2, 4]);
  assert.equal(top.share, 0.5);
  assert.ok(r.wrongFirstChoices.some((c) => c.optionId === 'run' && c.count === 1));
  assert.equal(r.totals.valid_certificates, 1);
});

test('overview filters by site and scenario; rejects bad filters', async () => {
  const b = (await call(`overview?site=${siteB}`, { token })).body;
  assert.deepEqual(b.scenarios.map((s) => s.scenario_id), ['conveyor-loto']);
  const f = (await call('overview?scenario=fire-panel', { token })).body;
  assert.deepEqual(f.scenarios.map((s) => s.scenario_id), ['fire-panel']);
  for (const q of ['site=abc', 'scenario=../etc', 'from=nonsense']) assert.equal((await call(`overview?${q}`, { token })).code, 400, q);
  const future = (await call('overview?from=2999-01-01', { token })).body;
  assert.equal(future.scenarios.length, 0);
});

test('attempts list includes flagged ones; detail returns steps and the scenario', async () => {
  const list = (await call('attempts', { token })).body.attempts;
  assert.equal(list.length, 6);
  assert.equal(list.filter((a) => a.flag).length, 1);
  const detail = (await call(`attempts/${list[0].id}`, { token })).body;
  assert.ok(detail.attempt.steps.length);
  assert.ok(detail.scenario.steps.length);
  assert.equal((await call('attempts/not-a-uuid', { token })).code, 404);
  assert.equal((await call(`attempts/${randomUUID()}`, { token })).code, 404);
});

test('workers: last training date and certificate status', async () => {
  const { workers } = (await call('workers', { token })).body;
  const bina = workers.find((w) => w.name === 'Bina');
  assert.equal(bina.certificate.status, 'expired');
  assert.equal(bina.attempts, 2);
  assert.ok(bina.last_training);
  assert.equal(workers.find((w) => w.name.startsWith('=')).certificate.status, 'valid');
});

test('certificates: search and revoke flips the public status', async () => {
  assert.equal((await call('certificates', { token })).body.certificates.length, 2);
  assert.equal((await call('certificates?q=bina', { token })).body.certificates.length, 1);
  assert.equal((await call('certificates?q=%25', { token })).body.certificates.length, 0, 'wildcards are literal');

  const pub = () => new Promise((resolve) => statusHandler(
    { method: 'GET', query: { id: cert1 }, headers: {} },
    { setHeader() {}, status() { return this; }, json: resolve }));
  assert.equal((await pub()).valid, true);
  const rev = await call(`certificates/${cert1}/revoke`, { method: 'POST', token });
  assert.equal(rev.code, 200);
  const st = await pub();
  assert.equal(st.valid, false);
  assert.equal(st.revoked, true);
  assert.equal((await call(`certificates/${cert1}/revoke`, { method: 'POST', token })).code, 200, 'idempotent');
  assert.equal((await call(`certificates/${randomUUID()}/revoke`, { method: 'POST', token })).code, 404);
  assert.equal((await call(`certificates/${cert1}/revoke`, { method: 'GET', token })).code, 404, 'GET is not revoke');
});

test('csv export: header, rows, and formula injection neutralised', async () => {
  const r = await call('export.csv', { token });
  assert.equal(r.code, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  const lines = r.body.trim().split('\r\n');
  assert.equal(lines[0], 'attempt_id,received_at,device_time,worker,employer_id,site,scenario,score,passed,critical_fail,duration_s');
  assert.equal(lines.length, 1 + 5, 'flagged attempt excluded');
  assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""evil"")"`)), 'name starts with an apostrophe, quotes doubled');
  assert.ok(!lines.some((l) => /,=HYPERLINK/.test(l)));
});

test('csv cell escaping', () => {
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('+1'), "'+1");
  assert.equal(cell('-2+3'), "'-2+3");
  assert.equal(cell('@x'), "'@x");
  assert.equal(cell(null), '');
  assert.equal(row([1, 'a', true]), '1,a,true');
});

test('wrongFirstChoices ignores correct picks, unknown scenarios and legacy records', () => {
  const fire = { steps: [{ id: 's2', type: 'choice', options: [{ id: 'alarm', correct: true }, { id: 'water', correct: false }] }] };
  const out = wrongFirstChoices([
    { scenario_id: 'fire-panel', steps: [{ stepId: 's2', choices: ['alarm'] }] },
    { scenario_id: 'fire-panel', steps: [{ stepId: 's2', optionId: 'water' }] }, // no choices[] (older client)
    { scenario_id: 'fire-panel', steps: [{ stepId: 's2', choices: ['timeout', 'alarm'] }] },
    { scenario_id: 'gone', steps: [{ stepId: 's2', choices: ['water'] }] },
  ], { 'fire-panel': fire });
  assert.deepEqual(out.map((o) => [o.optionId, o.count, o.reached]).sort(), [['timeout', 1, 3], ['water', 1, 3]]);
});
