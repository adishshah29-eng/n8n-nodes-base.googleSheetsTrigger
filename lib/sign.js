import { createHash, createHmac, createPrivateKey, createPublicKey, sign, timingSafeEqual, verify } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function privateKey() {
  const der = process.env.ED25519_PRIVATE_KEY; // base64 PKCS8 DER, see scripts/gen-key.js
  if (!der) throw Object.assign(new Error('ED25519_PRIVATE_KEY is not set'), { code: 'NO_SIGNING_KEY' });
  return createPrivateKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'pkcs8' });
}

/** Raw 32-byte public key, base64url — the value for the client's VITE_CERT_PUBLIC_KEY. */
export function publicKeyB64url() {
  const spki = createPublicKey(privateKey()).export({ type: 'spki', format: 'der' });
  return b64url(spki.subarray(spki.length - 32));
}

/**
 * Signs the exact ASCII bytes of the base64url payload string, so the verifier
 * needs no JSON canonicalisation: it checks the same string it is about to parse.
 */
export function signPayload(payload) {
  const p = b64url(JSON.stringify(payload));
  const signature = b64url(sign(null, Buffer.from(p), privateKey()));
  return { payload: p, signature, token: `${p}.${signature}` };
}

/** Checks a certificate token against our own key. Returns { payload, signature, cert } or null. */
export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  try {
    if (!verify(null, Buffer.from(payload), createPublicKey(privateKey()), Buffer.from(signature, 'base64url'))) return null;
    return { payload, signature, cert: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) };
  } catch (e) {
    if (e?.code === 'NO_SIGNING_KEY') throw e;
    return null;
  }
}

// ---------------------------------------------------------------- device tokens
// A phone's device token is the worker id plus an HMAC, so the server can trust it without looking it
// up: it keeps working after the (possibly ephemeral) database has been reset. The HMAC key is derived
// from the signing key, so there is no extra secret to configure.

const deviceKey = () => createHash('sha256').update('aotan-device-token\0').update(process.env.ED25519_PRIVATE_KEY ?? '').digest();
const mac = (workerId) => createHmac('sha256', deviceKey()).update(workerId).digest('base64url');

export function deviceToken(workerId) {
  privateKey(); // fail clearly if the key is missing
  return `v1.${workerId}.${mac(workerId)}`;
}

/** Returns the worker id a device token was issued for, or null. */
export function workerIdFromToken(token) {
  const m = /^v1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!m || !process.env.ED25519_PRIVATE_KEY) return null;
  const want = Buffer.from(mac(m[1]));
  const given = Buffer.from(m[2]);
  return given.length === want.length && timingSafeEqual(given, want) ? m[1] : null;
}
