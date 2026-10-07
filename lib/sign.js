import { createPrivateKey, createPublicKey, sign } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function privateKey() {
  const der = process.env.ED25519_PRIVATE_KEY; // base64 PKCS8 DER, see scripts/gen-key.js
  if (!der) throw new Error('ED25519_PRIVATE_KEY is not set');
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
