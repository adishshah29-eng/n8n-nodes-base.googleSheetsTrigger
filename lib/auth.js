import { workerIdFromToken } from './sign.js';

/** Resolves the worker for a `Bearer <deviceToken>` header, or null. No database lookup: the token is signed. */
export function workerFromRequest(req) {
  const m = /^Bearer (\S+)$/.exec(req.headers?.authorization ?? '');
  const id = m ? workerIdFromToken(m[1]) : null;
  return id ? { id } : null;
}
