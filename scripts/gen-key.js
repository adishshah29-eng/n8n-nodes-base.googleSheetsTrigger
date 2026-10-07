// Prints a fresh Ed25519 key pair in the formats the app expects.
//   ED25519_PRIVATE_KEY      -> Vercel env var (server only, never commit)
//   VITE_CERT_PUBLIC_KEY     -> client build env var
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const spki = publicKey.export({ type: 'spki', format: 'der' });
console.log('ED25519_PRIVATE_KEY=' + privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'));
console.log('VITE_CERT_PUBLIC_KEY=' + spki.subarray(spki.length - 32).toString('base64url'));
