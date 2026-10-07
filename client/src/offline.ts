import { registerSW } from 'virtual:pwa-register';

const KEY = 'aotan.offlineReady';
const listeners = new Set<() => void>();

const read = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** Registers the service worker. `onOfflineReady` fires once the whole precache is installed. */
export function initOffline(): void {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onOfflineReady() {
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* private mode: the badge just stays on "preparing" */
      }
      listeners.forEach((l) => l());
    },
  });
}

export function onOfflineReady(fn: () => void): void {
  listeners.add(fn);
}

/**
 * True only when the install finished, a worker is active AND the cache still exists. The flag
 * alone is not enough: Android can evict storage, and "Ready offline" must never be a lie.
 * We check for an active worker, not `controller`: the page that triggered the install is not
 * controlled until its next load, but the next open (even in airplane mode) will be.
 */
export async function isOfflineReady(): Promise<boolean> {
  if (!read() || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) return false;
    return (await caches.keys()).some((k) => k.includes('precache'));
  } catch {
    return false;
  }
}
