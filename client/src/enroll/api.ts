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

export type EnrollResult = { ok: true; worker: WorkerProfile } | { ok: false; reason: 'offline' | 'rejected' | 'server' };

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
  // 4xx: something in the form; 5xx: the server or its database is not ready (not the worker's fault)
  if (!res.ok) return { ok: false, reason: res.status >= 500 ? 'server' : 'rejected' };
  const { id, deviceToken } = (await res.json()) as { id: string; deviceToken: string };
  const worker: WorkerProfile = { id, deviceToken, name: input.name, lang: input.lang, employerId: input.employerId, siteId: input.siteId, photo: input.photo };
  await db.worker.put(worker);
  return { ok: true, worker };
}
