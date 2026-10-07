import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal HS256 JWT: enough for one admin role, no dependency to audit.
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const mac = (data, secret) => createHmac('sha256', secret).update(data).digest();

export function signJwt(payload, secret, ttlSeconds = 12 * 3600, now = Date.now()) {
  const body = { ...payload, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSeconds };
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(body)}`;
  return `${head}.${mac(head, secret).toString('base64url')}`;
}

/** Returns the payload, or null for a bad signature, wrong algorithm, malformed token or expiry. */
export function verifyJwt(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    if (header.alg !== 'HS256') return null; // never trust the token's own choice of algorithm
    const given = Buffer.from(parts[2], 'base64url');
    const want = mac(`${parts[0]}.${parts[1]}`, secret);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
