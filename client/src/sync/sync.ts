import { db, type WorkerProfile } from '../store/db';

const BATCH = 20;
let running: Promise<void> | null = null;

/**
 * Syncs with the server: posts queued attempts in batches, and on every sync also sends the worker's
 * profile (with photo) and the certificates this phone holds. The phone is the durable copy: if the
 * server's storage was reset (SQLite in /tmp on Vercel), it restores the worker and certificates from
 * this, and answers `resend` so the phone queues all its attempts again. Safe to call often and
 * concurrently (calls share one run); safe to retry (the server upserts by attempt id).
 */
export function syncOutbox(): Promise<void> {
  running ??= run().finally(() => (running = null));
  return running;
}

type SyncResponse = {
  synced?: string[];
  rejected?: { id: string | null }[];
  certificates?: { id: string; token: string }[];
  resend?: boolean;
};

async function run(): Promise<void> {
  if (!navigator.onLine) return;
  let worker = await db.worker.toCollection().first();
  if (!worker) return;
  let resent = false;

  for (let round = 0; round < 100; round++) {
    const items = await db.outbox.limit(BATCH).toArray();
    const attempts = (await db.attempts.bulkGet(items.map((i) => i.attemptId))).filter(Boolean);
    const certificates = (await db.certificates.toArray()).map((c) => c.token);
    let res: Response;
    try {
      res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${worker.deviceToken}` },
        body: JSON.stringify({ attempts, worker: profileOf(worker), certificates }),
      });
    } catch {
      return; // network dropped: keep everything queued for the next open/online event
    }
    if (res.status === 401) {
      // The server no longer accepts this phone's token (e.g. its key changed). Register again from the
      // stored profile; without a stored photo (older installs) the worker re-enrolls on the home screen.
      worker = await reenroll(worker);
      if (!worker) return;
      continue;
    }
    if (!res.ok) return;

    const body = (await res.json()) as SyncResponse;
    // Rejected attempts are malformed and will never be accepted: drop them too, so one bad item cannot block the queue.
    const done = [...(body.synced ?? []), ...(body.rejected ?? []).map((r) => r.id)].filter((id): id is string => !!id);
    await db.transaction('rw', db.outbox, db.certificates, async () => {
      if (done.length) await db.outbox.bulkDelete(done);
      if (body.certificates?.length) await db.certificates.bulkPut(body.certificates);
    });

    if (body.resend && !resent) {
      // The server had lost this worker's history: queue every attempt on the phone again.
      resent = true;
      const ids = (await db.attempts.toCollection().primaryKeys()) as string[];
      await db.outbox.bulkPut(ids.map((attemptId) => ({ attemptId })));
      continue;
    }
    if (done.length === 0 || (await db.outbox.count()) === 0) return; // finished, or nothing acknowledged (no tight loop)
  }
}

const profileOf = (w: WorkerProfile) =>
  w.photo && w.employerId ? { name: w.name, employerId: w.employerId, siteId: w.siteId ?? null, lang: w.lang, photo: w.photo } : undefined;

async function reenroll(old: WorkerProfile): Promise<WorkerProfile | undefined> {
  const profile = profileOf(old);
  if (!profile) {
    await db.worker.clear();
    return undefined;
  }
  try {
    const res = await fetch('/api/workers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) });
    if (!res.ok) return undefined;
    const { id, deviceToken } = (await res.json()) as { id: string; deviceToken: string };
    const fresh: WorkerProfile = { ...old, id, deviceToken };
    await db.transaction('rw', db.worker, async () => {
      await db.worker.clear();
      await db.worker.put(fresh);
    });
    return fresh;
  } catch {
    return undefined;
  }
}
