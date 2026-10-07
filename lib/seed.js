import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { certificateFor } from './certificates.js';
import { get, run, tx, whenOpened } from './db.js';

// Demo data for the admin dashboard: 24 workers across the sites in content/sites.json, ~60 days of
// attempts with believable mistakes, signed certificates, one revoked. Used by `node scripts/seed-demo.js`,
// and automatically on a fresh database when SEED_DEMO=1 (handy on Vercel, where the file can reset).

const NAMES = ['Sunil Hembram', 'Bina Murmu', 'Raju Soren', 'Malati Tudu', 'Ganesh Besra', 'Sita Kisku', 'Dilip Marandi', 'Phulmani Hansdak',
  'Mangal Baskey', 'Rupa Tudu', 'Lakhan Soren', 'Kamli Murmu', 'Budhan Hembram', 'Sonamani Kisku', 'Sagen Besra', 'Parvati Marandi',
  'Chandu Soren', 'Mina Hansdak', 'Jagan Tudu', 'Sumi Baskey', 'Rabi Murmu', 'Tuli Besra', 'Kartik Hembram', 'Basanti Soren'];
const SITES = [['Gua Iron Ore Mine', 'West Singhbhum'], ['Joda East Mine', 'Keonjhar'], ['Noamundi Mine', 'West Singhbhum']];

// Odds of each option being the FIRST pick, per step, so the dashboard's insight chart tells a believable story.
const FIRST = {
  'fire-panel': { s2: { water: 0.38, run: 0.2, alarm: 0.42 } },
  'conveyor-loto': {
    s2: { reach: 0.22, kick: 0.15, stop: 0.63 },
    s3: { button: 0.3, watch: 0.2, lock: 0.5 },
    s4: { assume: 0.12, ask: 0.28, test: 0.6 },
  },
};

const DAY = 86400_000;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (dist) => {
  let r = Math.random();
  for (const [k, p] of Object.entries(dist)) if ((r -= p) < 0) return k;
  return Object.keys(dist).at(-1);
};

/** A flat-colour PNG data URL: a stand-in "enrollment photo" so the verify and admin pages show something. */
function solidPng(r, g, b, n = 48) {
  const table = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = ~0;
    for (const x of buf) c = table[(c ^ x) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: n }, () => [r, g, b]).flat())]);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array(n).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Simulates one play-through using the scenario's own step definitions. */
function simulate(scenario) {
  const steps = [];
  let score = 0;
  let critical = false;
  let total = 0;
  for (const step of scenario.steps) {
    if (step.type === 'hazard') continue;
    if (step.type === 'action') {
      const ms = Math.round(rnd(6000, 14000));
      steps.push({ stepId: step.id, decisionMs: ms, tries: 1 });
      score += step.points ?? 0;
      total += ms;
      continue;
    }
    const choices = [];
    let ms = 0;
    for (;;) {
      // first pick follows the odds; any retry is the correct option (workers learn from the feedback)
      const correct = Object.fromEntries(step.options.filter((o) => o.correct).map((o) => [o.id, 1]));
      const id = pick(choices.length === 0 ? FIRST[scenario.id][step.id] : correct);
      choices.push(id);
      ms = Math.round(rnd(1800, 9000));
      total += ms;
      const opt = step.options.find((o) => o.id === id);
      if (opt.critical) {
        critical = true;
        break;
      }
      if (opt.correct) {
        score += opt.points ?? 0;
        break;
      }
    }
    steps.push({ stepId: step.id, optionId: choices.at(-1), choices, decisionMs: ms, tries: choices.length });
    if (critical) break;
  }
  const passed = !critical && score >= scenario.passScore;
  return { steps, score: critical ? 0 : score, passed, critical, durationMs: total + Math.round(rnd(8000, 20000)) };
}

const scenarioFile = (id) => JSON.parse(readFileSync(new URL(`../content/scenarios/${id}.json`, import.meta.url), 'utf8'));

/** Inserts the demo data. Returns counts. */
export function seedDemo() {
  const scenarios = [scenarioFile('fire-panel'), scenarioFile('conveyor-loto')];
  const siteIds = (JSON.parse(readFileSync(new URL('../content/sites.json', import.meta.url), 'utf8'))).map((s) => s.id);
  let attempts = 0;
  const certIds = [];
  tx(() => {
    for (const [i, name] of NAMES.entries()) {
      const colour = [60 + ((i * 53) % 160), 80 + ((i * 97) % 140), 100 + ((i * 31) % 120)];
      const workerId = randomUUID();
      run('INSERT INTO workers (id, name, employer_id, site_id, lang, photo_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        workerId, name, `EMP-${1000 + i}`, siteIds[i % siteIds.length], ['sat', 'sat', 'hi'][i % 3], solidPng(...colour), new Date(Date.now() - 70 * DAY));
      let latest = 0;
      for (const scenario of scenarios) {
        if (Math.random() < 0.15) continue; // not everyone has done both yet
        let when = Date.now() - rnd(1, 58) * DAY;
        for (let tries = 0; tries < 5; tries++) {
          const a = simulate(scenario);
          run(`INSERT INTO attempts (id, worker_id, scenario_id, score, passed, critical_fail, steps, duration_ms, device_time, received_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            randomUUID(), workerId, scenario.id, a.score, a.passed, a.critical, JSON.stringify(a.steps), a.durationMs, new Date(when - 3600_000), new Date(when));
          attempts++;
          latest = Math.max(latest, when);
          when += rnd(0.2, 3) * DAY;
          if (a.passed) break; // retrain until they pass, like on site
        }
      }
      if (!latest) continue;
      // issued as of the worker's last attempt, so certificate dates match the history
      const cert = certificateFor(workerId, { hasNewPass: true, now: new Date(Math.min(Date.now(), latest + 1000)) });
      if (cert) certIds.push(cert.id);
    }
    if (certIds.length > 3) run('UPDATE certificates SET revoked_at = ? WHERE id = ?', new Date(Date.now() - 2 * DAY), certIds[3]);
  });
  return { workers: NAMES.length, attempts, certificates: certIds.length, revoked: certIds.length > 3 ? 1 : 0 };
}

// SEED_DEMO=1: seed a fresh (empty) database once, when it is opened.
if (process.env.SEED_DEMO === '1') {
  whenOpened(() => {
    if (get('SELECT count(*) AS n FROM workers').n === 0 && process.env.ED25519_PRIVATE_KEY) seedDemo();
  });
}
