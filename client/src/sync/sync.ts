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

    const body = (await res.json()) as {
      synced?: string[];
      rejected?: { id: string | null }[];
      certificates?: { id: string; token: string }[];
    };
    // Rejected attempts are malformed and will never be accepted; drop them too
    // so one bad item cannot block the queue.
    const done = [...(body.synced ?? []), ...(body.rejected ?? []).map((r) => r.id)].filter(
      (id): id is string => !!id,
    );
    if (done.length === 0) return; // nothing acknowledged; avoid a tight retry loop
    await db.transaction('rw', db.outbox, db.certificates, async () => {
      await db.outbox.bulkDelete(done);
      if (body.certificates?.length) await db.certificates.bulkPut(body.certificates);
    });
  }
}
