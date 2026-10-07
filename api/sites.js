import { pool } from '../lib/db.js';

// GET /api/sites — public list for the enrollment form
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const { rows } = await pool.query('SELECT id, name, district FROM sites ORDER BY name');
  res.status(200).json({ sites: rows });
}
