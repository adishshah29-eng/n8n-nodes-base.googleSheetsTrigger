import { readFile } from 'node:fs/promises';

const DIR = new URL('../content/scenarios/', import.meta.url);

/** Loads a scenario definition, or null if the id is unknown. Cached per instance. */
const cache = new Map();
export async function loadScenario(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) return null;
  if (!cache.has(id)) {
    try {
      cache.set(id, JSON.parse(await readFile(new URL(`${id}.json`, DIR), 'utf8')));
    } catch {
      cache.set(id, null);
    }
  }
  return cache.get(id);
}
