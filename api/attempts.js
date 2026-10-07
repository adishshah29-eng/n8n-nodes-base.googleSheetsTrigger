import { pool, withDb } from '../lib/db.js';
import { workerFromRequest } from '../lib/auth.js';
import { MAX_BATCH, validateAttempt } from '../lib/attempts.js';
import { certificateFor } from '../lib/certificates.js';
import { plausibilityFlag } from '../lib/plausibility.js';
import { loadScenario } from '../lib/scenarios.js';

// Upsert on id: a sync that died halfway can simply be retried. A conflicting
// id owned by another worker is never overwritten (the WHERE makes it a no-op).
const UPSERT = `
  INSERT INTO attempts (id, worker_id, scenario_id, score, passed, critical_fail, steps, duration_ms, device_time, flag)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    scenario_id = EXCLUDED.scenario_id, score = EXCLUDED.score, passed = EXCLUDED.passed,
    critical_fail = EXCLUDED.critical_fail, steps = EXCLUDED.steps,
    duration_ms = EXCLUDED.duration_ms, device_time = EXCLUDED.device_time, flag = EXCLUDED.flag
  WHERE attempts.worker_id = EXCLUDED.worker_id
  RETURNING id, (xmax = 0) AS inserted`;

// POST /api/attempts — batch sync from the client outbox.
// Body: { attempts: [...] }.
// Response: { synced: [ids], rejected: [{ id, error }], flagged: [{ id, reason }],
//             certificates: [{ id, token }] }
// Passing attempts that fail the plausibility checks are stored but flagged and earn no certificate.
// `synced` includes attempts the server already had; the client clears both lists.
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const worker = await workerFromRequest(req);
  if (!worker) return res.status(401).json({ error: 'invalid device token' });

  const attempts = req.body?.attempts;
  if (!Array.isArray(attempts) || attempts.length === 0 || attempts.length > MAX_BATCH) {
    return res.status(400).json({ error: `attempts must be an array of 1-${MAX_BATCH}` });
  }

  const synced = [];
  const rejected = [];
  const flagged = [];
  let hasPass = false;
  let hasNewPass = false;
  let certificate = null;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const a of attempts) {
      const error = validateAttempt(a);
      if (error) {
        rejected.push({ id: a?.id ?? null, error });
        continue;
      }
      const flag = plausibilityFlag(a, await loadScenario(a.scenarioId));
      const { rowCount, rows } = await db.query(UPSERT, [
        a.id, worker.id, a.scenarioId, a.score, a.passed, a.criticalFail ?? false,
        JSON.stringify(a.steps), a.durationMs, a.deviceTime, flag,
      ]);
      if (!rowCount) {
        rejected.push({ id: a.id, error: 'id belongs to another worker' });
        continue;
      }
      synced.push(a.id);
      if (flag) flagged.push({ id: a.id, reason: flag });
      else if (a.passed) {
        hasPass = true;
        hasNewPass ||= rows[0].inserted;
      }
    }
    if (hasPass) certificate = await certificateFor(db, worker.id, { hasNewPass });
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }

  res.status(200).json({ synced, rejected, flagged, certificates: certificate ? [certificate] : [] });
}

export default withDb(handler);
