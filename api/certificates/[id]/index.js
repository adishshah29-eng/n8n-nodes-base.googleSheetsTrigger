import { pool } from '../../../lib/db.js';
import { workerFromRequest } from '../../../lib/auth.js';
import { isUuid } from '../../../lib/attempts.js';

// GET /api/certificates/:id — the phone re-downloads its own certificate token.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const worker = await workerFromRequest(req);
  if (!worker) return res.status(401).json({ error: 'invalid device token' });
  const { id } = req.query;
  if (!isUuid(id)) return res.status(404).json({ error: 'not found' });

  const { rows } = await pool.query(
    'SELECT id, payload, signature FROM certificates WHERE id = $1 AND worker_id = $2',
    [id, worker.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.status(200).json({ id: rows[0].id, token: `${rows[0].payload}.${rows[0].signature}` });
}
