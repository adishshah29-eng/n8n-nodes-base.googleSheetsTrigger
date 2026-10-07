import { isUuid } from '../attempts.js';
import { all, get, now, run } from '../db.js';
import { loadScenario } from '../scenarios.js';
import { issueAdminToken, isAdmin, passwordOk } from './auth.js';
import { row } from './csv.js';
import { certStatus, wrongFirstChoices } from './stats.js';

const LIMIT = 500;
const FROM = 'FROM attempts a LEFT JOIN workers w ON w.id = a.worker_id LEFT JOIN sites s ON s.id = w.site_id';
const bool = (r, ...keys) => (keys.forEach((k) => (r[k] = !!r[k])), r);

/** WHERE clause for attempts (alias a) + workers (alias w). Stats and exports skip flagged attempts. Null on bad input. */
function attemptFilter(q, { includeFlagged = false } = {}) {
  const where = [includeFlagged ? '1 = 1' : 'a.flag IS NULL'];
  const params = [];
  if (q.site) {
    if (!/^\d+$/.test(q.site)) return null;
    where.push('w.site_id = ?');
    params.push(Number(q.site));
  }
  if (q.scenario) {
    if (!/^[a-z0-9-]+$/.test(q.scenario)) return null;
    where.push('a.scenario_id = ?');
    params.push(q.scenario);
  }
  for (const [key, op] of [['from', '>='], ['to', '<']]) {
    if (!q[key]) continue;
    const d = new Date(q[key]);
    if (Number.isNaN(d.getTime())) return null;
    if (key === 'to') d.setDate(d.getDate() + 1); // `to` is an inclusive calendar day
    where.push(`a.received_at ${op} ?`);
    params.push(d.toISOString());
  }
  return { sql: where.join(' AND '), params };
}

const routes = {
  async 'GET overview'(req, res, q) {
    const f = attemptFilter(q);
    if (!f) return res.status(400).json({ error: 'bad filter' });
    const byScenario = all(
      `SELECT a.scenario_id, count(*) AS attempts, sum(a.passed) AS passed, sum(a.critical_fail) AS critical
       ${FROM} WHERE ${f.sql} GROUP BY a.scenario_id ORDER BY a.scenario_id`, ...f.params);
    const recent = all(`SELECT a.scenario_id, a.steps ${FROM} WHERE ${f.sql} ORDER BY a.received_at DESC LIMIT 5000`, ...f.params)
      .map((r) => ({ scenario_id: r.scenario_id, steps: JSON.parse(r.steps) }));
    const ids = [...new Set(recent.map((r) => r.scenario_id))];
    const defs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadScenario(id)])));
    res.status(200).json({
      scenarios: byScenario.map((r) => ({ ...r, passRate: r.attempts ? r.passed / r.attempts : 0 })),
      wrongFirstChoices: wrongFirstChoices(recent, defs).slice(0, 12),
      totals: {
        workers: get('SELECT count(*) AS n FROM workers').n,
        valid_certificates: get('SELECT count(*) AS n FROM certificates WHERE revoked_at IS NULL AND expires_at > ?', now()).n,
        flaggedAttempts: get('SELECT count(*) AS n FROM attempts WHERE flag IS NOT NULL').n,
      },
      scenarioDefs: Object.fromEntries(Object.entries(defs).filter(([, d]) => d)),
    });
  },

  async 'GET attempts'(req, res, q) {
    const f = attemptFilter(q, { includeFlagged: true });
    if (!f) return res.status(400).json({ error: 'bad filter' });
    const rows = all(
      `SELECT a.id, a.scenario_id, a.score, a.passed, a.critical_fail, a.flag, a.duration_ms, a.received_at,
              a.worker_id, w.name, w.employer_id, s.name AS site
       ${FROM} WHERE ${f.sql} ORDER BY a.received_at DESC LIMIT ${LIMIT}`, ...f.params);
    res.status(200).json({ attempts: rows.map((r) => bool({ ...r, name: r.name ?? 'Unknown worker' }, 'passed', 'critical_fail')) });
  },

  async 'GET attempts/:id'(req, res, q, [id]) {
    if (!isUuid(id)) return res.status(404).json({ error: 'not found' });
    const a = get(`SELECT a.*, w.name, w.employer_id, w.photo_url, s.name AS site ${FROM} WHERE a.id = ?`, id);
    if (!a) return res.status(404).json({ error: 'not found' });
    bool(a, 'passed', 'critical_fail');
    a.steps = JSON.parse(a.steps);
    a.name ??= 'Unknown worker';
    res.status(200).json({ attempt: a, scenario: await loadScenario(a.scenario_id) });
  },

  async 'GET workers'(req, res) {
    const rows = all(
      `SELECT w.id, w.name, w.employer_id, w.lang, w.created_at, s.name AS site,
              (SELECT max(received_at) FROM attempts a WHERE a.worker_id = w.id) AS last_training,
              (SELECT count(*) FROM attempts a WHERE a.worker_id = w.id) AS attempts,
              c.id AS cert_id, c.scenarios, c.expires_at, c.revoked_at
       FROM workers w LEFT JOIN sites s ON s.id = w.site_id
       LEFT JOIN certificates c ON c.id = (SELECT id FROM certificates WHERE worker_id = w.id ORDER BY issued_at DESC LIMIT 1)
       ORDER BY w.name LIMIT ${LIMIT}`);
    res.status(200).json({
      workers: rows.map(({ cert_id, scenarios, expires_at, revoked_at, ...w }) => ({
        ...w,
        certificate: { id: cert_id, scenarios: scenarios ? JSON.parse(scenarios) : null, expiresAt: expires_at, status: certStatus({ id: cert_id, expires_at, revoked_at }) },
      })),
    });
  },

  async 'GET certificates'(req, res, q) {
    let where = '1 = 1';
    const params = [];
    if (q.q) {
      where = "(w.name LIKE ? ESCAPE '\\' OR w.employer_id LIKE ? ESCAPE '\\' OR c.id LIKE ? ESCAPE '\\')";
      const like = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
      params.push(like, like, like);
    }
    const rows = all(
      `SELECT c.id, c.scenarios, c.score, c.issued_at, c.expires_at, c.revoked_at, w.name, w.employer_id
       FROM certificates c LEFT JOIN workers w ON w.id = c.worker_id WHERE ${where}
       ORDER BY c.issued_at DESC LIMIT ${LIMIT}`, ...params);
    res.status(200).json({ certificates: rows.map((c) => ({ ...c, name: c.name ?? 'Unknown worker', scenarios: JSON.parse(c.scenarios), status: certStatus(c) })) });
  },

  async 'POST certificates/:id/revoke'(req, res, q, [id]) {
    if (!isUuid(id)) return res.status(404).json({ error: 'not found' });
    run('UPDATE certificates SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?', now(), id);
    const c = get('SELECT id, revoked_at FROM certificates WHERE id = ?', id);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.status(200).json({ id: c.id, revokedAt: c.revoked_at });
  },

  async 'GET export.csv'(req, res, q) {
    const f = attemptFilter(q);
    if (!f) return res.status(400).json({ error: 'bad filter' });
    const rows = all(
      `SELECT a.id, a.received_at, a.device_time, w.name, w.employer_id, s.name AS site, a.scenario_id,
              a.score, a.passed, a.critical_fail, a.duration_ms
       ${FROM} WHERE ${f.sql} ORDER BY a.received_at DESC`, ...f.params);
    const lines = [row(['attempt_id', 'received_at', 'device_time', 'worker', 'employer_id', 'site', 'scenario', 'score', 'passed', 'critical_fail', 'duration_s'])];
    for (const r of rows) {
      lines.push(row([r.id, r.received_at, r.device_time, r.name, r.employer_id, r.site, r.scenario_id, r.score, !!r.passed, !!r.critical_fail, Math.round(r.duration_ms / 1000)]));
    }
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="aotan-attempts.csv"');
    res.status(200).send(lines.join('\r\n') + '\r\n');
  },
};

/** Matches "METHOD a/b/:param" patterns against the request, returning [handler, params]. */
function match(method, path) {
  for (const [pattern, fn] of Object.entries(routes)) {
    const [m, p] = pattern.split(' ');
    if (m !== method) continue;
    const pp = p.split('/');
    const ap = path.split('/');
    if (pp.length !== ap.length) continue;
    const params = [];
    if (pp.every((seg, i) => (seg.startsWith(':') ? (params.push(decodeURIComponent(ap[i])), true) : seg === ap[i]))) return [fn, params];
  }
  return null;
}

/**
 * /api/admin/* — `path` is the part after /api/admin/ (the dispatcher passes it). Called directly (tests),
 * it is read from the URL.
 */
export async function handleAdmin(req, res, path) {
  const url = new URL(req.url, 'http://localhost');
  const { path: _ignored, ...q } = { ...Object.fromEntries(url.searchParams), ...(req.query ?? {}) };
  const route = (path ?? url.pathname.replace(/^\/api\/admin\/?/, '')).replace(/^\/+|\/+$/g, '');

  if (route === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_JWT_SECRET) return res.status(503).json({ error: 'admin not configured: set ADMIN_PASSWORD and ADMIN_JWT_SECRET' });
    if (!passwordOk(req.body?.password)) {
      await new Promise((r) => setTimeout(r, 400)); // blunt brute-force speed bump
      return res.status(401).json({ error: 'wrong password' });
    }
    return res.status(200).json({ token: issueAdminToken() });
  }

  if (!isAdmin(req)) return res.status(401).json({ error: 'admin login required' });
  const found = match(req.method, route);
  if (!found) return res.status(404).json({ error: 'not found' });
  return found[0](req, res, q, found[1]);
}
