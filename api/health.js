import { explain, pool, ready } from '../lib/db.js';

// GET /api/health          -> the functions are running
// GET /api/health?db=1     -> also checks the database: reachable, logged in, schema up to date
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('db') !== '1') return res.status(200).json({ ok: true });
  try {
    await ready();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM migrations');
    res.status(200).json({ ok: true, db: 'ok', migrations: rows[0].n });
  } catch (e) {
    const why = explain(e);
    res.status(why.status).json({ ok: false, db: why.error });
  }
}
