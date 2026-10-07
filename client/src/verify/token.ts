import * as ed from '@noble/ed25519';

export interface CertPayload {
  c: string; // certificate id
  w: string; // worker id
  sc: string[]; // scenarios passed
  s: number; // score
  i: number; // issued at (unix seconds)
  e: number; // expires at (unix seconds)
}

export type TokenCheck =
  | { ok: true; cert: CertPayload; expired: boolean }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'no-key' };

const fromB64url = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};

/**
 * Checks a certificate token entirely on the device, so it works offline.
 * The server signs the ASCII bytes of the base64url payload string; we verify the
 * same string before parsing it, so a tampered payload can never reach JSON.parse.
 */
export async function checkToken(
  token: string,
  publicKeyB64url: string | undefined,
  now = Date.now(),
): Promise<TokenCheck> {
  if (!publicKeyB64url) return { ok: false, reason: 'no-key' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [payload, sig] = parts;

  let signature: Uint8Array;
  let key: Uint8Array;
  try {
    signature = fromB64url(sig);
    key = fromB64url(publicKeyB64url);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (signature.length !== 64 || key.length !== 32) return { ok: false, reason: 'malformed' };

  let valid = false;
  try {
    valid = await ed.verifyAsync(signature, new TextEncoder().encode(payload), key);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad-signature' };

  try {
    const cert = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as CertPayload;
    if (typeof cert.c !== 'string' || !Array.isArray(cert.sc) || typeof cert.e !== 'number') {
      return { ok: false, reason: 'malformed' };
    }
    return { ok: true, cert, expired: cert.e * 1000 <= now };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
