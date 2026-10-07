import { workerFromRequest } from '../auth.js';
import { MAX_BATCH, validateAttempt } from '../attempts.js';
import { certificateFor, restoreCertificate } from '../certificates.js';
import { get, now, run, tx } from '../db.js';
import { plausibilityFlag } from '../plausibility.js';
import { loadScenario } from '../scenarios.js';
import { restoreWorker, validateProfile } from '../workers.js';

// POST /api/attempts — sync from the phone.
// Body: { attempts: [...] (0-50), worker?: profile, certificates?: [token] }
// Response: { synced, rejected: [{ id, error }], flagged: [{ id, reason }], certificates: [{ id, token }], resend }
//
// The phone is the durable copy (the server's SQLite file may have been reset, e.g. on Vercel). So every
// sync can carry the worker's profile and the certificates the phone holds, and this handler puts back
// whatever is missing. If the server did not know the worker, it answers `resend: true` and the phone
// queues all of its attempts again. Upserts by attempt id make all of this safe to repeat.
export default async function attempts(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const worker = workerFromRequest(req);
  if (!worker) return res.status(401).json({ error: 'invalid device token' });

  const body = req.body ?? {};
  const list = body.attempts ?? [];
  if (!Array.isArray(list) || list.length > MAX_BATCH) return res.status(400).json({ error: `attempts must be an array of 0-${MAX_BATCH}` });
  const held = Array.isArray(body.certificates) ? body.certificates.slice(0, 20) : [];
  const profile = body.worker ? validateProfile(body.worker).profile : undefined;

  // scenario definitions are loaded before the (synchronous) transaction
  const defs = new Map();
  for (const a of list) if (a && typeof a.scenarioId === 'string' && !defs.has(a.scenarioId)) defs.set(a.scenarioId, await loadScenario(a.scenarioId));

  const out = tx(() => {
    const synced = [], rejected = [], flagged = [];
    const known = !!get('SELECT 1 AS x FROM workers WHERE id = ?', worker.id);
    let restored = false;
    if (!known && profile) restored = restoreWorker(worker.id, profile);
    for (const t of held) restoreCertificate(t, worker.id);

    let hasPass = false, hasNewPass = false;
    for (const a of list) {
      const error = validateAttempt(a);
      if (error) {
        rejected.push({ id: a?.id ?? null, error });
        continue;
      }
      const owner = get('SELECT worker_id FROM attempts WHERE id = ?', a.id);
      if (owner && owner.worker_id !== worker.id) {
        rejected.push({ id: a.id, error: 'id belongs to another worker' });
        continue;
      }
      const flag = plausibilityFlag(a, defs.get(a.scenarioId));
      const vals = [a.scenarioId, a.score, a.passed, a.criticalFail ?? false, JSON.stringify(a.steps), a.durationMs, a.deviceTime, flag];
      if (owner) run('UPDATE attempts SET scenario_id = ?, score = ?, passed = ?, critical_fail = ?, steps = ?, duration_ms = ?, device_time = ?, flag = ? WHERE id = ?', ...vals, a.id);
      else run('INSERT INTO attempts (scenario_id, score, passed, critical_fail, steps, duration_ms, device_time, flag, id, worker_id, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...vals, a.id, worker.id, now());
      synced.push(a.id);
      if (flag) flagged.push({ id: a.id, reason: flag });
      else if (a.passed) {
        hasPass = true;
        hasNewPass ||= !owner;
      }
    }
    const certificate = hasPass ? certificateFor(worker.id, { hasNewPass }) : null;
    // The server had lost this worker: ask the phone for everything it has (once; it is now known).
    return { synced, rejected, flagged, certificates: certificate ? [certificate] : [], resend: !known && restored };
  });
  res.status(200).json(out);
}
