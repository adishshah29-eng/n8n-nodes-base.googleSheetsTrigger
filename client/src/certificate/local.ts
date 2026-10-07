import { db, type StoredCertificate } from '../store/db';
import { checkToken, type CertPayload } from '../verify/token';

export interface LocalCertificate {
  stored: StoredCertificate;
  cert: CertPayload;
  expired: boolean;
}

/** All certificates on this phone whose signature verifies, newest-issued first. Unverified tokens are never returned. */
export async function localCertificates(): Promise<LocalCertificate[]> {
  const out: LocalCertificate[] = [];
  for (const stored of await db.certificates.toArray()) {
    const r = await checkToken(stored.token, import.meta.env.VITE_CERT_PUBLIC_KEY);
    if (r.ok) out.push({ stored, cert: r.cert, expired: r.expired });
  }
  return out.sort((a, b) => b.cert.i - a.cert.i);
}

export async function latestCertificate(): Promise<LocalCertificate | null> {
  return (await localCertificates())[0] ?? null;
}

/** A current (unexpired) certificate that already lists this scenario, if the phone has one. */
export async function certificateCovering(scenarioId: string): Promise<LocalCertificate | null> {
  return (await localCertificates()).find((c) => !c.expired && c.cert.sc.includes(scenarioId)) ?? null;
}
