import Dexie, { type Table } from 'dexie';
import type { StepRecord } from '../engine/types';

export interface WorkerProfile {
  id: string;
  deviceToken: string;
  name: string;
  lang: 'sat' | 'hi' | 'en';
}

export interface Attempt {
  id: string; // client-generated UUID; the server upserts on it
  workerId: string;
  scenarioId: string;
  score: number;
  passed: boolean;
  criticalFail: boolean;
  steps: StepRecord[];
  durationMs: number;
  deviceTime: string;
}

export interface OutboxItem {
  attemptId: string;
}

export interface StoredCertificate {
  id: string;
  token: string;
}

class AotanDB extends Dexie {
  worker!: Table<WorkerProfile, string>;
  attempts!: Table<Attempt, string>;
  outbox!: Table<OutboxItem, string>;
  certificates!: Table<StoredCertificate, string>;

  constructor() {
    super('aotan');
    this.version(1).stores({
      worker: 'id',
      attempts: 'id, workerId, scenarioId',
      outbox: 'attemptId',
      certificates: 'id',
    });
  }
}

export const db = new AotanDB();

/** Keeps Android from evicting the precached assets when storage runs low. */
export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

export async function saveAttempt(a: Omit<Attempt, 'id' | 'deviceTime'>): Promise<Attempt> {
  const attempt: Attempt = { ...a, id: crypto.randomUUID(), deviceTime: new Date().toISOString() };
  await db.transaction('rw', db.attempts, db.outbox, async () => {
    await db.attempts.add(attempt);
    await db.outbox.add({ attemptId: attempt.id });
  });
  return attempt;
}
