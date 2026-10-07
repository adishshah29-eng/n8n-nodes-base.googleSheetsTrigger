import { db, type WorkerProfile } from '../store/db';
import type { Lang } from '../i18n';

export interface EnrollInput {
  name: string;
  employerId: string;
  siteId: number | null;
  lang: Lang;
  photo: string;
}

export interface Site {
  id: number;
  name: string;
  district: string | null;
}

export async function fetchSites(): Promise<Site[]> {
  try {
    const res = await fetch('/api/sites');
    return res.ok ? ((await res.json()) as { sites: Site[] }).sites : [];
  } catch {
    return []; // offline or no sites configured: the form just omits the site field
  }
}

export type EnrollResult = { ok: true; worker: WorkerProfile } | { ok: false; reason: 'offline' | 'rejected' };

/** Registers the worker with the server and stores the device token locally. Needs a connection. */
export async function enroll(input: EnrollInput): Promise<EnrollResult> {
  let res: Response;
  try {
    res = await fetch('/api/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (!res.ok) return { ok: false, reason: 'rejected' };
  const { id, deviceToken } = (await res.json()) as { id: string; deviceToken: string };
  const worker: WorkerProfile = { id, deviceToken, name: input.name, lang: input.lang };
  await db.worker.put(worker);
  return { ok: true, worker };
}
