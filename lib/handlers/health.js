import { dbPath, ephemeral, get } from '../db.js';

// GET /api/health — the API and its storage are working.
export default function health(_req, res) {
  const n = (sql) => get(sql).n;
  res.status(200).json({
    ok: true,
    storage: 'sqlite',
    path: dbPath(),
    ephemeral: ephemeral(), // true on Vercel: resets when the function restarts; phones restore their data
    workers: n('SELECT count(*) AS n FROM workers'),
    attempts: n('SELECT count(*) AS n FROM attempts'),
    certificates: n('SELECT count(*) AS n FROM certificates'),
  });
}
