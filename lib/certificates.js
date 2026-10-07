import { randomUUID } from 'node:crypto';
import { all, get, run } from './db.js';
import { signPayload, verifyToken } from './sign.js';

export const VALIDITY_MONTHS = Number(process.env.CERT_VALIDITY_MONTHS ?? 12); // our assumption, not a DGMS rule

const tokenOf = (c) => ({ id: c.id, token: `${c.payload}.${c.signature}` });

/**
 * The certificate a worker's passes currently earn: one certificate listing every scenario they have
 * passed (plausibly, within the validity window).
 * - Reuses a matching valid certificate, so a retried sync returns the same one.
 * - Issues a new one only when `hasNewPass` (a passing attempt was just inserted), so re-syncing
 *   never resurrects a certificate an admin revoked.
 * Returns { id, token } or null.
 */
export function certificateFor(workerId, { hasNewPass, now = new Date() }) {
  const since = new Date(now);
  since.setMonth(since.getMonth() - VALIDITY_MONTHS);
  const rows = all(
    `SELECT scenario_id, MAX(score) AS best FROM attempts
     WHERE worker_id = ? AND passed = 1 AND flag IS NULL AND received_at > ?
     GROUP BY scenario_id ORDER BY scenario_id`,
    workerId, since,
  );
  if (rows.length === 0) return null;
  const scenarios = rows.map((r) => r.scenario_id);
  const score = Math.round(rows.reduce((n, r) => n + r.best, 0) / rows.length);

  const existing = get(
    `SELECT id, payload, signature FROM certificates
     WHERE worker_id = ? AND scenarios = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY issued_at DESC LIMIT 1`,
    workerId, JSON.stringify(scenarios), now,
  );
  if (existing) return tokenOf(existing);
  if (!hasNewPass) return null;

  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + VALIDITY_MONTHS);
  const id = randomUUID();
  // Compact keys keep the QR small: c=cert, w=worker, sc=scenarios, s=score, i=issued, e=expires
  const { payload, signature } = signPayload({ c: id, w: workerId, sc: scenarios, s: score, i: Math.floor(now / 1000), e: Math.floor(expires / 1000) });
  run(
    `INSERT INTO certificates (id, worker_id, scenarios, score, issued_at, expires_at, payload, signature)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workerId, JSON.stringify(scenarios), score, now, expires, payload, signature,
  );
  return tokenOf({ id, payload, signature });
}

/**
 * Puts back a certificate the phone holds but this server has lost (after a reset). Only tokens that
 * verify against our own key and belong to this worker are accepted. Returns true if it was restored.
 */
export function restoreCertificate(token, workerId) {
  const v = verifyToken(token);
  if (!v || v.cert?.w !== workerId || typeof v.cert.c !== 'string') return false;
  if (get('SELECT 1 AS x FROM certificates WHERE id = ?', v.cert.c)) return false;
  run(
    `INSERT INTO certificates (id, worker_id, scenarios, score, issued_at, expires_at, payload, signature)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    v.cert.c, workerId, JSON.stringify([...v.cert.sc].sort()), v.cert.s, new Date(v.cert.i * 1000), new Date(v.cert.e * 1000), v.payload, v.signature,
  );
  return true;
}
