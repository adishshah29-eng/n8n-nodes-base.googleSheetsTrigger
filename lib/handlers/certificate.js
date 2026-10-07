import { workerFromRequest } from '../auth.js';
import { isUuid } from '../attempts.js';
import { get } from '../db.js';

// GET /api/certificates/:id — the phone re-downloads its own certificate token.
export default function certificate(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const worker = workerFromRequest(req);
  if (!worker) return res.status(401).json({ error: 'invalid device token' });
  const { id } = req.query;
  if (!isUuid(id)) return res.status(404).json({ error: 'not found' });
  const c = get('SELECT id, payload, signature FROM certificates WHERE id = ? AND worker_id = ?', id, worker.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.status(200).json({ id: c.id, token: `${c.payload}.${c.signature}` });
}
