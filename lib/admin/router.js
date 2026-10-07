import { pool } from '../db.js';
import { isUuid } from '../attempts.js';
import { loadScenario } from '../scenarios.js';
import { issueAdminToken, isAdmin, passwordOk } from './auth.js';
import { row } from './csv.js';
import { certStatus, wrongFirstChoices } from './stats.js';

const LIMIT = 500;

/** Builds the WHERE clause for attempts (alias a) joined to workers (alias w). Returns null on bad input. */
/** Stats and exports skip flagged (implausible) attempts; the attempts list shows them. */
function attemptFilter(q, { includeFlagged = false } = {}) {
  const where = [includeFlagged ? 'true' : 'a.flag IS NULL'];
  const params = [];
  const add = (sql, v) => (params.push(v), where.push(sql.replace('?', `$${params.length}`)));
  if (q.site) {
    if (!/^\d+$/.test(q.site)) return null;
    add('w.site_id = ?', Number(q.site));
  }
  if (q.scenario) {
    if (!/^[a-z0-9-]+$/.test(q.scenario)) return null;
    add('a.scenario_id = ?', q.scenario);
  }
  for (const [key, op] of [['from', '>='], ['to', '<']]) {
    if (!q[key]) continue;
    const d = new Date(q[key]);
    if (Number.isNaN(d.getTime())) return null;
    if (key === 'to') d.setDate(d.getDate() + 1); // `to` is an inclusive calendar day
    add(`a.received_at ${op} ?`, d);
  }
  return { sql: where.join(' AND '), params };
}

const FROM = 'FROM attempts a JOIN workers w ON w.id = a.worker_id LEFT JOIN sites s ON s.id = w.site_id';

const routes = {
  async 'GET overview'(req, res, q) {
    const f = attemptFilter(q);
    if (!f) return res.status(400).json({ error: 'bad filter' });
    const [byScenario, recent, totals, flagged] = await Promise.all([
      pool.query(
        `SELECT a.scenario_id, count(*)::int AS attempts, count(*) FILTER (WHERE a.passed)::int AS passed,
                count(*) FILTER (WHERE a.critical_fail)::int AS critical
         ${FROM} WHERE ${f.sql} GROUP BY a.scenario_id ORDER BY a.scenario_id`, f.params),
      pool.query(`SELECT a.scenario_id, a.steps ${FROM} WHERE ${f.sql} ORDER BY a.received_at DESC LIMIT 5000`, f.params),
      pool.query(`SELECT (SELECT count(*) FROM workers)::int AS workers,
                         (SELECT count(*) FROM certificates WHERE revoked_at IS NULL AND expires_at > now())::int AS valid_certificates`),
      pool.query('SELECT count(*)::int AS n FROM attempts WHERE flag IS NOT NULL'),
    ]);
    const ids = [...new Set(recent.rows.map((r) => r.scenario_id))];
    const defs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadScenario(id)])));
    res.status(200).json({
      scenarios: byScenario.rows.map((r) => ({ ...r, passRate: r.attempts ? r.passed / r.attempts : 0 })),
      wrongFirstChoices: wrongFirstChoices(recent.rows, defs).slice(0, 12),
      totals: { ...totals.rows[0], flaggedAttempts: flagged.rows[0].n },
      scenarioDefs: Object.fromEntries(Object.entries(defs).filter(([, d]) => d)),
    });
  },

  async 'GET attempts'(req, res, q) {
    const f = attemptFilter(q, { includeFlagged: true });
    if (!f) return res.status(400).json({ error: 'bad filter' });
    const { rows } = await pool.query(
      `SELECT a.id, a.scenario_id, a.score, a.passed, a.critical_fail, a.flag, a.duration_ms, a.received_at,
              w.id AS worker_id, w.name, w.employer_id, s.name AS site
       ${FROM} WHERE ${f.sql} ORDER BY a.received_at DESC LIMIT ${LIMIT}`, f.params);
    res.status(200).json({ attempts: rows });
  },

  async 'GET attempts/:id'(req, res, q, [id]) {
    if (!isUuid(id)) return res.status(404).json({ error: 'not found' });
    const { rows } = await pool.query(
      `SELECT a.*, w.name, w.employer_id, w.photo_url, s.name AS site ${FROM} WHERE a.id = $1`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.status(200).json({ attempt: rows[0], scenario: await loadScenario(rows[0].scenario_id) });
  },

  async 'GET workers'(req, res) {
    const { rows } = await pool.query(
      `SELECT w.id, w.name, w.employer_id, w.lang, w.created_at, s.name AS site,
              (SELECT max(received_at) FROM attempts a WHERE a.worker_id = w.id) AS last_training,
              (SELECT count(*) FROM attempts a WHERE a.worker_id = w.id)::int AS attempts,
              c.id AS cert_id, c.scenarios, c.expires_at, c.revoked_at
       FROM workers w LEFT JOIN sites s ON s.id = w.site_id
       LEFT JOIN LATERAL (SELECT id, scenarios, expires_at, revoked_at FROM certificates c
                          WHERE c.worker_id = w.id ORDER BY issued_at DESC LIMIT 1) c ON true
       ORDER BY w.name LIMIT ${LIMIT}`);
    res.status(200).json({
      workers: rows.map(({ cert_id, scenarios, expires_at, revoked_at, ...w }) => ({
        ...w, certificate: { id: cert_id, scenarios, expiresAt: expires_at, status: certStatus({ id: cert_id, expires_at, revoked_at }) },
      })),
    });
  },

  async 'GET certificates'(req, res, q) {
    const params = [];
    let where = 'true';
    if (q.q) {
      params.push(`%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
      where = `(w.name ILIKE $1 OR w.employer_id ILIKE $1 OR c.id::text ILIKE $1)`;
    }
    const { rows } = await pool.query(
      `SELECT c.id, c.scenarios, c.score, c.issued_at, c.expires_at, c.revoked_at, w.name, w.employer_id
       FROM certificates c JOIN workers w ON w.id = c.worker_id WHERE ${where}
       ORDER BY c.issued_at DESC LIMIT ${LIMIT}`, params);
    res.status(200).json({ certificates: rows.map((c) => ({ ...c, status: certStatus(c) })) });
  },

  async 'POST certificates/:id/revoke'(req, res, q, [id]) {
    if (!isUuid(id)) return res.status(404).json({ error: 'not found' });
    const { rows } = await pool.query(
      'UPDATE certificates SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING id, revoked_at', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.status(200).json({ id: rows[0].id, revokedAt: rows[0].revoked_at });
  },

  async 'GET export.csv'(req, res, q) {
    const f = attemptFilter(q);
    if (!f) return res.status(400).json({ error: 'bad filter' });
    const { rows } = await pool.query(
      `SELECT a.id, a.received_at, a.device_time, w.name, w.employer_id, s.name AS site, a.scenario_id,
              a.score, a.passed, a.critical_fail, a.duration_ms
       ${FROM} WHERE ${f.sql} ORDER BY a.received_at DESC`, f.params);
    const lines = [row(['attempt_id', 'received_at', 'device_time', 'worker', 'employer_id', 'site', 'scenario', 'score', 'passed', 'critical_fail', 'duration_s'])];
    for (const r of rows) {
      lines.push(row([r.id, r.received_at, r.device_time, r.name, r.employer_id, r.site, r.scenario_id, r.score, r.passed, r.critical_fail, Math.round(r.duration_ms / 1000)]));
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

/** Single entry point for /api/admin/* (one function keeps us under Vercel's per-plan function limit). */
export async function handleAdmin(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // On Vercel the route arrives as ?path=... (see the rewrite in vercel.json); elsewhere it is in the URL.
  const { path: routed, ...query } = { ...Object.fromEntries(url.searchParams), ...(req.query ?? {}) };
  const raw = typeof routed === 'string' ? routed : Array.isArray(routed) ? routed.join('/') : url.pathname.replace(/^\/api\/admin\/?/, '');
  const path = raw.replace(/^\/+|\/+$/g, '');
  const q = query;

  if (path === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_JWT_SECRET) return res.status(503).json({ error: 'admin not configured' });
    if (!passwordOk(req.body?.password)) {
      await new Promise((r) => setTimeout(r, 400)); // blunt brute-force speed bump
      return res.status(401).json({ error: 'wrong password' });
    }
    return res.status(200).json({ token: issueAdminToken() });
  }

  if (!isAdmin(req)) return res.status(401).json({ error: 'admin login required' });
  const found = match(req.method, path);
  if (!found) return res.status(404).json({ error: 'not found' });
  return found[0](req, res, q, found[1]);
}
