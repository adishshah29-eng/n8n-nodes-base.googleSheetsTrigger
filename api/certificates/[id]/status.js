import { pool, withDb } from '../../../lib/db.js';
import { isUuid } from '../../../lib/attempts.js';

// GET /api/certificates/:id/status — public, used by the verify page.
// The signature proves the certificate is genuine; this adds revocation and the
// worker's identity (name, employer, enrollment photo), which is deliberately not in the QR.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const { id } = req.query;
  if (!isUuid(id)) return res.status(404).json({ error: 'not found' });

  const { rows } = await pool.query(
    `SELECT c.scenarios, c.score, c.issued_at, c.expires_at, c.revoked_at,
            w.name, w.employer_id, w.photo_url
     FROM certificates c JOIN workers w ON w.id = c.worker_id WHERE c.id = $1`,
    [id],
  );
  const c = rows[0];
  if (!c) return res.status(404).json({ error: 'not found' });

  const revoked = c.revoked_at !== null;
  const expired = c.expires_at <= new Date();
  res.setHeader('cache-control', 'no-store'); // revocation must show immediately
  res.status(200).json({
    valid: !revoked && !expired,
    revoked,
    expired,
    scenarios: c.scenarios,
    score: c.score,
    issuedAt: c.issued_at,
    expiresAt: c.expires_at,
    worker: { name: c.name, employerId: c.employer_id, photo: c.photo_url },
  });
}

export default withDb(handler);
