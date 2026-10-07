import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import { call, run } from './helpers.js';

const { signJwt, verifyJwt } = await import('../lib/admin/jwt.js');
const { row, cell } = await import('../lib/admin/csv.js');
const { wrongFirstChoices } = await import('../lib/admin/stats.js');

const iso = (d = new Date()) => d.toISOString();
let token, w1, w2, cert1;
const steps = (first, rest = []) => [{ stepId: 's2', optionId: rest.at(-1) ?? first, choices: [first, ...rest], decisionMs: 3000, tries: 1 + rest.length }];
const addAttempt = (worker, scenario, { passed, critical = false, score = passed ? 70 : 0, first = 'alarm', rest = [], flag = null }) =>
  run(`INSERT INTO attempts (id, worker_id, scenario_id, score, passed, critical_fail, steps, duration_ms, device_time, received_at, flag)
       VALUES (?, ?, ?, ?, ?, ?, ?, 30000, ?, ?, ?)`, randomUUID(), worker, scenario, score, passed, critical, JSON.stringify(steps(first, rest)), iso(), iso(), flag);
const addWorker = (name, site) => {
  const id = randomUUID();
  run("INSERT INTO workers (id, name, employer_id, site_id, lang, photo_url, created_at) VALUES (?, ?, 'E', ?, 'en', 'data:image/png;base64,AAAA', ?)", id, name, site, iso());
  return id;
};
const addCert = (id, worker, scenarios, expires) =>
  run("INSERT INTO certificates (id, worker_id, scenarios, score, issued_at, expires_at, payload, signature) VALUES (?, ?, ?, 70, ?, ?, 'pay', 'sig')", id, worker, JSON.stringify(scenarios), iso(), iso(expires));
const auth = () => ({ token });

before(async () => {
  w1 = addWorker('=HYPERLINK("evil")', 1); // hostile name, for the CSV test (site 1 = Gua)
  w2 = addWorker('Bina', 2);
  // fire-panel at site 1: water, water, run->alarm, alarm  (2 critical fails, a pass after a wrong try, a clean pass)
  addAttempt(w1, 'fire-panel', { passed: false, critical: true, first: 'water' });
  addAttempt(w1, 'fire-panel', { passed: false, critical: true, first: 'water' });
  addAttempt(w1, 'fire-panel', { passed: true, first: 'run', rest: ['alarm'] });
  addAttempt(w1, 'fire-panel', { passed: true, first: 'alarm' });
  // site 2, conveyor; plus a flagged "pass" that must not count
  addAttempt(w2, 'conveyor-loto', { passed: true, score: 100, first: 'stop' });
  addAttempt(w2, 'fire-panel', { passed: true, flag: 'step s2 too fast' });
  cert1 = randomUUID();
  addCert(cert1, w1, ['fire-panel'], new Date(Date.now() + 365 * 864e5));
  addCert(randomUUID(), w2, ['conveyor-loto'], new Date(Date.now() - 864e5)); // expired
});

test('jwt: signs, verifies, and rejects tampering, expiry and alg=none', () => {
  const t = signJwt({ role: 'admin' }, 's', 60, 0);
  assert.equal(verifyJwt(t, 's', 1000)?.role, 'admin');
  assert.equal(verifyJwt(t, 'other', 1000), null);
  assert.equal(verifyJwt(t, 's', 61_000), null);
  const [h, p, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ role: 'admin', exp: 9e9 })).toString('base64url');
  assert.equal(verifyJwt(`${h}.${forged}.${sig}`, 's', 1000), null);
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.equal(verifyJwt(`${none}.${p}.`, 's', 1000), null);
});

test('login: wrong password 401, right one gives a token', async () => {
  assert.equal((await call('POST', 'admin/login', { body: { password: 'nope' } })).code, 401);
  assert.equal((await call('POST', 'admin/login', { body: {} })).code, 401);
  assert.equal((await call('GET', 'admin/login')).code, 405);
  const ok = await call('POST', 'admin/login', { body: { password: 'correct horse' } });
  assert.equal(ok.code, 200);
  token = ok.body.token;
});

test('every other admin route needs the token', async () => {
  for (const p of ['overview', 'attempts', 'workers', 'certificates', 'export.csv']) {
    assert.equal((await call('GET', `admin/${p}`)).code, 401, p);
    assert.equal((await call('GET', `admin/${p}`, { token: 'garbage' })).code, 401, p);
  }
  assert.equal((await call('GET', 'admin/nope', auth())).code, 404);
});

test('overview: pass rates exclude flagged attempts; wrong first choices ranked', async () => {
  const r = (await call('GET', 'admin/overview', auth())).body;
  const fire = r.scenarios.find((s) => s.scenario_id === 'fire-panel');
  assert.deepEqual([fire.attempts, fire.passed, fire.critical], [4, 2, 2]);
  assert.equal(fire.passRate, 0.5);
  assert.equal(r.totals.flaggedAttempts, 1);
  assert.equal(r.totals.workers, 2);
  assert.equal(r.totals.valid_certificates, 1);
  const top = r.wrongFirstChoices[0];
  assert.deepEqual([top.scenarioId, top.stepId, top.optionId, top.count, top.reached, top.share], ['fire-panel', 's2', 'water', 2, 4, 0.5]);
  assert.ok(r.wrongFirstChoices.some((c) => c.optionId === 'run' && c.count === 1));
});

test('overview filters by site, scenario and date; rejects bad filters', async () => {
  assert.deepEqual((await call('GET', 'admin/overview?site=2', auth())).body.scenarios.map((s) => s.scenario_id), ['conveyor-loto']);
  assert.deepEqual((await call('GET', 'admin/overview?scenario=fire-panel', auth())).body.scenarios.map((s) => s.scenario_id), ['fire-panel']);
  for (const q of ['site=abc', 'scenario=../etc', 'from=nonsense']) assert.equal((await call('GET', `admin/overview?${q}`, auth())).code, 400, q);
  assert.equal((await call('GET', 'admin/overview?from=2999-01-01', auth())).body.scenarios.length, 0);
});

test('attempts list includes flagged ones; detail returns steps and the scenario', async () => {
  const list = (await call('GET', 'admin/attempts', auth())).body.attempts;
  assert.equal(list.length, 6);
  assert.equal(list.filter((a) => a.flag).length, 1);
  assert.equal(typeof list[0].passed, 'boolean');
  const detail = (await call('GET', `admin/attempts/${list[0].id}`, auth())).body;
  assert.ok(detail.attempt.steps.length);
  assert.ok(detail.scenario.steps.length);
  assert.equal((await call('GET', 'admin/attempts/not-a-uuid', auth())).code, 404);
  assert.equal((await call('GET', `admin/attempts/${randomUUID()}`, auth())).code, 404);
});

test('workers: last training date and certificate status', async () => {
  const { workers } = (await call('GET', 'admin/workers', auth())).body;
  const bina = workers.find((w) => w.name === 'Bina');
  assert.equal(bina.certificate.status, 'expired');
  assert.equal(bina.attempts, 2);
  assert.ok(bina.last_training);
  assert.equal(bina.site, 'Joda East Mine');
  assert.equal(workers.find((w) => w.name.startsWith('=')).certificate.status, 'valid');
});

test('certificates: search (wildcards literal) and revoke flips the public status', async () => {
  assert.equal((await call('GET', 'admin/certificates', auth())).body.certificates.length, 2);
  assert.equal((await call('GET', 'admin/certificates?q=bina', auth())).body.certificates.length, 1);
  assert.equal((await call('GET', `admin/certificates?q=${encodeURIComponent('%')}`, auth())).body.certificates.length, 0);
  assert.equal((await call('GET', `certificates/${cert1}/status`)).body.valid, true);
  assert.equal((await call('POST', `admin/certificates/${cert1}/revoke`, auth())).code, 200);
  const st = (await call('GET', `certificates/${cert1}/status`)).body;
  assert.deepEqual([st.valid, st.revoked], [false, true]);
  assert.equal((await call('POST', `admin/certificates/${cert1}/revoke`, auth())).code, 200, 'idempotent');
  assert.equal((await call('POST', `admin/certificates/${randomUUID()}/revoke`, auth())).code, 404);
  assert.equal((await call('GET', `admin/certificates/${cert1}/revoke`, auth())).code, 404, 'GET is not revoke');
});

test('csv export: header, rows, formula injection neutralised', async () => {
  const r = await call('GET', 'admin/export.csv', auth());
  assert.equal(r.code, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  const lines = r.body.trim().split('\r\n');
  assert.equal(lines[0], 'attempt_id,received_at,device_time,worker,employer_id,site,scenario,score,passed,critical_fail,duration_s');
  assert.equal(lines.length, 1 + 5, 'flagged attempt excluded');
  assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""evil"")"`)));
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
    { scenario_id: 'fire-panel', steps: [{ stepId: 's2', optionId: 'water' }] },
    { scenario_id: 'fire-panel', steps: [{ stepId: 's2', choices: ['timeout', 'alarm'] }] },
    { scenario_id: 'gone', steps: [{ stepId: 's2', choices: ['water'] }] },
  ], { 'fire-panel': fire });
  assert.deepEqual(out.map((o) => [o.optionId, o.count, o.reached]).sort(), [['timeout', 1, 3], ['water', 1, 3]]);
});
