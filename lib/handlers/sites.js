import { all } from '../db.js';

// GET /api/sites — public list for the enrollment form (from content/sites.json)
export default function sites(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  res.status(200).json({ sites: all('SELECT id, name, district FROM sites ORDER BY name') });
}
