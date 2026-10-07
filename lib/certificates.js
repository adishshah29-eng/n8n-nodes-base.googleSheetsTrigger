import { randomUUID } from 'node:crypto';
import { signPayload } from './sign.js';

export const VALIDITY_MONTHS = Number(process.env.CERT_VALIDITY_MONTHS ?? 12); // our assumption, not a DGMS rule

const tokenOf = (c) => ({ id: c.id, token: `${c.payload}.${c.signature}` });

/**
 * The certificate a worker's passes currently earn: one certificate listing every
 * scenario they have passed (plausibly, within the validity window).
 *
 * - Reuses a matching valid certificate, so a retried sync returns the same one.
 * - Issues a new one only when `hasNewPass` (a passing attempt was just inserted),
 *   so re-syncing never resurrects a certificate an admin revoked.
 * Returns { id, token } or null.
 */
export async function certificateFor(db, workerId, { hasNewPass, now = new Date() }) {
  const since = new Date(now);
  since.setMonth(since.getMonth() - VALIDITY_MONTHS);

  const { rows } = await db.query(
    `SELECT scenario_id, MAX(score) AS best FROM attempts
     WHERE worker_id = $1 AND passed AND flag IS NULL AND received_at > $2
     GROUP BY scenario_id ORDER BY scenario_id`,
    [workerId, since],
  );
  if (rows.length === 0) return null;
  const scenarios = rows.map((r) => r.scenario_id);
  const score = Math.round(rows.reduce((n, r) => n + r.best, 0) / rows.length);

  const existing = await db.query(
    `SELECT id, payload, signature FROM certificates
     WHERE worker_id = $1 AND scenarios = $2 AND revoked_at IS NULL AND expires_at > $3
     ORDER BY issued_at DESC LIMIT 1`,
    [workerId, scenarios, now],
  );
  if (existing.rows[0]) return tokenOf(existing.rows[0]);
  if (!hasNewPass) return null;

  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + VALIDITY_MONTHS);
  const id = randomUUID();
  // Compact keys keep the QR small: c=cert, w=worker, sc=scenarios, s=score, i=issued, e=expires
  const { payload, signature } = signPayload({
    c: id, w: workerId, sc: scenarios, s: score,
    i: Math.floor(now / 1000), e: Math.floor(expires / 1000),
  });
  await db.query(
    `INSERT INTO certificates (id, worker_id, scenarios, score, issued_at, expires_at, signature, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, workerId, scenarios, score, now, expires, signature, payload],
  );
  return tokenOf({ id, payload, signature });
}
