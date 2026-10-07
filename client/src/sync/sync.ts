import { db } from '../store/db';

const BATCH = 20;

/** Posts the outbox in batches. Safe to retry: the server upserts by attempt id. */
export async function syncOutbox(): Promise<void> {
  if (!navigator.onLine) return;
  const worker = (await db.worker.toCollection().first());
  if (!worker) return;

  for (;;) {
    const items = await db.outbox.limit(BATCH).toArray();
    if (items.length === 0) return;
    const attempts = await db.attempts.bulkGet(items.map((i) => i.attemptId));

    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${worker.deviceToken}` },
      body: JSON.stringify({ attempts: attempts.filter(Boolean) }),
    });
    if (!res.ok) return; // keep the outbox; try again on the next open/online event

    const body = (await res.json()) as { certificates?: { id: string; token: string }[] };
    await db.transaction('rw', db.outbox, db.certificates, async () => {
      await db.outbox.bulkDelete(items.map((i) => i.attemptId));
      if (body.certificates?.length) await db.certificates.bulkPut(body.certificates);
    });
  }
}
