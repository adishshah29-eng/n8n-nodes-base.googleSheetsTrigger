// Full end-to-end run: throwaway database + signing key -> build client -> start the API/static server
// -> run every spec in a real browser -> tear everything down.
//
//   npm run e2e                       all specs
//   npm run e2e -- scenario ar        only specs whose name contains one of the words
//
// Needs: a local PostgreSQL you can CREATE DATABASE on (DATABASE_URL), and Chromium (CHROMIUM_PATH,
// default /opt/pw-browsers/chromium).
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const base = process.env.DATABASE_URL;
if (!base) {
  console.error('Set DATABASE_URL to a LOCAL Postgres (the runner creates and drops its own database on it).');
  process.exit(2);
}
const u = new URL(base);
if (!['localhost', '127.0.0.1', '::1', ''].includes(u.hostname)) {
  console.error(`Refusing to run e2e against "${u.hostname}": it must be a local database.`);
  process.exit(2);
}

const dbName = `aotan_e2e_${Date.now()}`;
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`CREATE DATABASE ${dbName}`);
const dbUrl = new URL(base);
dbUrl.pathname = `/${dbName}`;

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const spki = publicKey.export({ type: 'spki', format: 'der' });
const env = {
  ...process.env,
  DATABASE_URL: dbUrl.toString(),
  ED25519_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  VITE_CERT_PUBLIC_KEY: spki.subarray(spki.length - 32).toString('base64url'),
  ADMIN_PASSWORD: 'e2e-admin-password',
  ADMIN_JWT_SECRET: randomBytes(32).toString('hex'),
  E2E_PORT: process.env.E2E_PORT ?? '4180',
};

let server;
let failed = [];
const cleanup = async () => {
  server?.kill();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
};
process.on('SIGINT', async () => (await cleanup(), process.exit(130)));

try {
  const run = (cmd, a, opts = {}) => {
    const r = spawnSync(cmd, a, { cwd: root, env, stdio: 'inherit', ...opts });
    if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} failed`);
  };
  console.log('• migrating throwaway database', dbName);
  run('node', ['scripts/migrate.js']);
  const sites = new pg.Client({ connectionString: env.DATABASE_URL });
  await sites.connect();
  await sites.query("INSERT INTO sites (name, district) VALUES ('E2E Mine', 'Test District')");
  await sites.end();

  // Always rebuild: the certificate public key is baked into the client, and every run uses a fresh key.
  // (A stale build would correctly refuse to show certificates signed by a different key.)
  console.log('• building the client with the e2e public key');
  run('npm', ['run', 'build', '--prefix', 'client'], { stdio: ['ignore', 'ignore', 'inherit'] });

  console.log('• starting server on :' + env.E2E_PORT);
  server = spawn('node', ['e2e/server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes('ready') && resolve());
    server.on('exit', () => reject(new Error('server exited early')));
    setTimeout(() => reject(new Error('server did not start')), 15000);
  });

  const specs = readdirSync(join(root, 'e2e/specs')).filter((f) => f.endsWith('.spec.mjs')).sort()
    .filter((f) => only.length === 0 || only.some((w) => f.includes(w)));
  if (!specs.length) throw new Error('no specs matched');
  for (const spec of specs) {
    console.log(`\n▶ ${spec}`);
    const r = spawnSync('node', [join('e2e/specs', spec)], { cwd: root, env, stdio: 'inherit' });
    if (r.status !== 0) failed.push(spec);
  }
} catch (e) {
  console.error('\nrunner error:', e.message);
  failed.push('(runner)');
} finally {
  await cleanup();
}

console.log(failed.length ? `\n✗ FAILED: ${failed.join(', ')}` : '\n✓ all e2e specs passed');
process.exit(failed.length ? 1 : 0);
