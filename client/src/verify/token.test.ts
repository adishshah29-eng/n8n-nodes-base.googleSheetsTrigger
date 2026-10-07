import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkToken } from './token';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const spki = publicKey.export({ type: 'spki', format: 'der' });
const PUB = spki.subarray(spki.length - 32).toString('base64url');

// Mirrors lib/sign.js on the server
const mint = (payload: object, key = privateKey) => {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${p}.${sign(null, Buffer.from(p), key).toString('base64url')}`;
};
const cert = { c: 'id-1', w: 'w-1', sc: ['fire-panel'], s: 70, i: 1_700_000_000, e: 1_800_000_000 };

describe('checkToken', () => {
  it('accepts a token signed by the server key', async () => {
    const r = await checkToken(mint(cert), PUB, 1_750_000_000_000);
    expect(r).toMatchObject({ ok: true, expired: false, cert });
  });

  it('flags an expired certificate but still verifies it', async () => {
    const r = await checkToken(mint(cert), PUB, 1_900_000_000_000);
    expect(r).toMatchObject({ ok: true, expired: true });
  });

  it('rejects a tampered payload', async () => {
    const [, sig] = mint(cert).split('.');
    const forged = Buffer.from(JSON.stringify({ ...cert, sc: ['fire-panel', 'conveyor-loto'] })).toString('base64url');
    expect(await checkToken(`${forged}.${sig}`, PUB)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a token signed by a different key', async () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    expect(await checkToken(mint(cert, other), PUB)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects malformed input and a missing key', async () => {
    expect(await checkToken('garbage', PUB)).toEqual({ ok: false, reason: 'malformed' });
    expect(await checkToken('a.b', PUB)).toEqual({ ok: false, reason: 'malformed' });
    expect(await checkToken(mint(cert), undefined)).toEqual({ ok: false, reason: 'no-key' });
  });
});
