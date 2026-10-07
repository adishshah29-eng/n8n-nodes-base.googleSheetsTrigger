import { createHash, timingSafeEqual } from 'node:crypto';
import { signJwt, verifyJwt } from './jwt.js';

const secret = () => process.env.ADMIN_JWT_SECRET;

/** Constant-time password check (hash both sides so lengths match). */
export function passwordOk(given) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof given !== 'string') return false;
  const h = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}

export const issueAdminToken = () => signJwt({ role: 'admin' }, secret());

export function isAdmin(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  return !!m && verifyJwt(m[1], secret())?.role === 'admin';
}
