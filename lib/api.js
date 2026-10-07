import { handleAdmin } from './admin/router.js';
import attempts from './handlers/attempts.js';
import certificateStatus from './handlers/certificate-status.js';
import certificate from './handlers/certificate.js';
import health from './handlers/health.js';
import sites from './handlers/sites.js';
import workers from './handlers/workers.js';

// Every API route, in one place. All of /api/* is served by ONE Vercel function (api/index.js), so all
// requests share one SQLite file: separate functions would each get their own /tmp and their own data.

const routes = [
  [/^health$/, health],
  [/^workers$/, workers],
  [/^sites$/, sites],
  [/^attempts$/, attempts],
  [/^certificates\/([^/]+)$/, certificate, 'id'],
  [/^certificates\/([^/]+)\/status$/, certificateStatus, 'id'],
];

/** The route: ?path=... after the vercel.json rewrite, otherwise read from the URL. */
export function routeOf(req) {
  const url = new URL(req.url, 'http://localhost');
  const p = req.query?.path ?? url.searchParams.get('path');
  const raw = typeof p === 'string' ? p : Array.isArray(p) ? p.join('/') : url.pathname.replace(/^\/api\/?/, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

export async function dispatch(req, res) {
  const route = routeOf(req);
  req.query ??= {};
  if (route === 'admin' || route.startsWith('admin/')) return handleAdmin(req, res, route.slice(6));
  for (const [re, handler, param] of routes) {
    const m = route.match(re);
    if (!m) continue;
    if (param) req.query[param] = decodeURIComponent(m[1]);
    return handler(req, res);
  }
  res.status(404).json({ error: `no API route "${route}"` });
}
