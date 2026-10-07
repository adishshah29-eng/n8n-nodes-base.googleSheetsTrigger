// A small stand-in for `vercel dev`: serves client/dist and routes /api/* to the real files in api/,
// using Vercel's file-based routing ([id] params, [...catch-all], index.js). Used by the e2e tests.
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const DIST = join(ROOT, 'client/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function loadRoutes() {
  const routes = [];
  const walk = async (dir, segs) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { await walk(join(dir, e.name), [...segs, e.name]); continue; }
      if (!e.name.endsWith('.js')) continue;
      const base = e.name.slice(0, -3);
      const parts = base === 'index' ? segs : [...segs, base];
      const names = [];
      const re = parts.map((p) => {
        if (p.startsWith('[...')) { names.push(p.slice(4, -1)); return '.*'; }
        if (p.startsWith('[')) { names.push(p.slice(1, -1)); return '([^/]+)'; }
        return p.replace(/[.*+?^${}()|\\]/g, '\\$&');
      });
      const catchAll = parts.some((p) => p.startsWith('[...'));
      // index.js answers at its folder AND at .../index, like on Vercel
      const path = ['', 'api', ...re].join('/') + (base === 'index' ? '(?:/index)?' : '');
      routes.push({ re: new RegExp(`^${path}/?$`), names, file: join(dir, e.name), specificity: catchAll ? 0 : parts.length + 1 });
    }
  };
  await walk(join(ROOT, 'api'), []);
  return routes.sort((a, b) => b.specificity - a.specificity);
}

const routes = await loadRoutes();

// vercel.json rewrites for /api (e.g. /api/admin/:path* -> /api/admin?path=:path*), applied like Vercel
// does when no file matches, so the tests exercise the same routing as production.
const vercel = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const apiRewrites = (vercel.rewrites ?? [])
  .filter((r) => r.source.startsWith('/api/'))
  .map((r) => {
    const names = [];
    const re = r.source.replace(/:(\w+)\*/g, (_, n) => (names.push(n), '(.*)')).replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'));
    return { re: new RegExp(`^${re}$`), names, destination: r.destination };
  });
function rewrite(url) {
  if (routes.some((x) => x.re.test(url.pathname))) return url;
  for (const r of apiRewrites) {
    const m = url.pathname.match(r.re);
    if (!m) continue;
    let dest = r.destination;
    r.names.forEach((n, i) => (dest = dest.replace(new RegExp(`:${n}\\*?`, 'g'), m[i + 1])));
    const out = new URL(dest, url);
    url.searchParams.forEach((v, k) => out.searchParams.set(k, v)); // Vercel keeps the original query
    return out;
  }
  return url;
}
const modules = new Map();
const handlerFor = async (file) => {
  if (!modules.has(file)) modules.set(file, (await import(pathToFileURL(file).href)).default);
  return modules.get(file);
};

http.createServer(async (req, res) => {
  let url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    url = rewrite(url);
    const r = routes.find((x) => x.re.test(url.pathname));
    if (!r) return res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"no such route"}');
    const m = url.pathname.match(r.re);
    req.query = { ...Object.fromEntries(url.searchParams), ...Object.fromEntries(r.names.map((n, i) => [n, m[i + 1]])) };
    let raw = '';
    for await (const c of req) raw += c;
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch { return res.writeHead(400).end('{"error":"bad json"}'); }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    res.send = (t) => res.end(t);
    try { await (await handlerFor(r.file))(req, res); } catch (e) { console.error('handler error:', e); res.statusCode = 500; res.end('{"error":"server error"}'); }
    return;
  }
  let file = join(DIST, url.pathname);
  let body = url.pathname.endsWith('/') ? null : await readFile(file).catch(() => null);
  if (!body) { file = join(DIST, 'index.html'); body = await readFile(file); } // SPA fallback
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  res.end(body);
}).listen(Number(process.env.E2E_PORT ?? 4180), () => console.log('e2e server ready'));
