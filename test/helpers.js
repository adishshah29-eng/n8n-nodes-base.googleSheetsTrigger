// Shared test setup: every test file runs in its own process with its own temporary SQLite file,
// signing key and admin credentials, and calls the API through the real dispatcher (lib/api.js).
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'aotan-test-')), 'test.db');
process.env.ED25519_PRIVATE_KEY = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
process.env.ADMIN_PASSWORD = 'correct horse';
process.env.ADMIN_JWT_SECRET = 'test-secret-test-secret-test-secret';

const { dispatch } = await import('../lib/api.js');
const { withDb } = await import('../lib/db.js');
export * from '../lib/db.js';

const handler = withDb(dispatch);

/** Calls the API like a client would: `call('POST', 'attempts', { body, token })`. */
export const call = (method, path, { body, token, headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const res = {
      code: 200, headers: {}, headersSent: false,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.code = c; return this; },
      json(o) { resolve({ code: this.code, body: o, headers: this.headers }); },
      send(t) { resolve({ code: this.code, body: t, headers: this.headers }); },
    };
    const auth = token ? { authorization: `Bearer ${token}` } : {};
    Promise.resolve(handler({ method, url: `/api/${path}`, body, headers: { ...auth, ...headers } }, res)).catch(reject);
  });

export const PHOTO = 'data:image/jpeg;base64,/9j/AAAA';
export const profile = (name = 'Test Worker', over = {}) => ({ name, employerId: 'E1', lang: 'sat', photo: PHOTO, ...over });

export async function enroll(name, over) {
  const r = await call('POST', 'workers', { body: profile(name, over) });
  if (r.code !== 201) throw new Error(`enroll failed: ${JSON.stringify(r.body)}`);
  return r.body; // { id, deviceToken }
}

/** A plausible passing fire-panel attempt. */
export const attempt = (over = {}) => ({
  id: randomUUID(), scenarioId: 'fire-panel', score: 70, passed: true, criticalFail: false,
  steps: [
    { stepId: 's2', optionId: 'alarm', choices: ['alarm'], decisionMs: 2000, tries: 1 },
    { stepId: 's3', decisionMs: 5000, tries: 1 },
  ],
  durationMs: 30000, deviceTime: new Date().toISOString(), ...over,
});

export const sync = (token, attempts, extra = {}) => call('POST', 'attempts', { body: { attempts, ...extra }, token });
