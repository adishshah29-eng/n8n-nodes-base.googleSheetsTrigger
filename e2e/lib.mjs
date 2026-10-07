import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

export const BASE = process.env.E2E_BASE ?? `http://localhost:${process.env.E2E_PORT ?? 4180}`;
export const ROOT = join(import.meta.dirname, '..');
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'e2e-admin-password';
export const PHOTO = 'data:image/jpeg;base64,/9j/AAAA';
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

/** Runs one named step; prints a tick or the failure and exits non-zero (the runner reports it). */
export async function step(name, fn) {
  try {
    const out = await fn();
    console.log(`  ✓ ${name}`);
    return out;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${String(e.message ?? e).split('\n').join('\n    ')}`);
    process.exitCode = 1;
    throw e;
  }
}

export const launch = (opts = {}) => chromium.launch({ executablePath: EXE, ...opts });

/** Chromium with a fake camera that streams the given MJPEG file (see makeFeed). WebGL via software GL. */
export const launchWithCamera = (feed) =>
  launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${feed}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

export async function sql(query, params = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(query, params)).rows;
  } finally {
    await c.end();
  }
}

/** Enrolls a worker through the real API. */
export async function enrollViaApi(name, lang = 'en', photo = PHOTO) {
  const r = await fetch(`${BASE}/api/workers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, employerId: 'E2E-1', lang, photo }) });
  assert.equal(r.status, 201, 'enrollment via API');
  return r.json();
}

/**
 * A phone that is already enrolled: a real worker row on the server, and the device token stored
 * in the page's IndexedDB exactly as the enrollment screen would have stored it.
 */
export async function enrolledPhone(browser, { name = 'E2E Worker', lang = 'en', contextOptions = {}, photo } = {}) {
  const w = await enrollViaApi(name, lang, photo);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...contextOptions });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('    PAGE ERROR:', e.message));
  await page.goto(`${BASE}/`); // creates the Dexie database
  await page.evaluate(async ({ w, name, lang }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('aotan'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => { const tx = db.transaction('worker', 'readwrite'); tx.objectStore('worker').put({ id: w.id, deviceToken: w.deviceToken, name, lang }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  }, { w, name, lang });
  return { page, context, workerId: w.id, deviceToken: w.deviceToken };
}

/**
 * Waits until the service worker is activated and the precache exists: the only moment "airplane mode"
 * is safe. Polls from Node: an async predicate in page.waitForFunction returned too early here.
 */
export async function waitOfflineReady(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      return reg?.active?.state === 'activated' && (await caches.keys()).some((k) => k.includes('precache'));
    });
    if (ready) return;
    await page.waitForTimeout(250);
  }
  throw new Error('service worker never became ready for offline use');
}

/** 640x480 MJPEG "camera" showing a marker (or nothing) for Chromium's fake video capture. */
export async function makeFeed(code, markerPx = 250) {
  const file = join(tmpdir(), `aotan-feed-${code ?? 'blank'}-${markerPx}.mjpeg`);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const img = code ? `<img src="data:image/png;base64,${readFileSync(join(ROOT, 'markers', `${code}.png`)).toString('base64')}" style="width:${markerPx}px;height:${markerPx}px">` : '';
  await page.setContent(`<body style="margin:0;background:#8a8f98;display:flex;align-items:center;justify-content:center;height:480px">${img}</body>`);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
  await browser.close();
  writeFileSync(file, Buffer.concat(Array(40).fill(jpg)));
  return file;
}

export function selfiePng() {
  const png = new PNG({ width: 800, height: 600 });
  png.data.fill(180);
  const file = join(tmpdir(), 'aotan-selfie.png');
  writeFileSync(file, PNG.sync.write(png));
  return file;
}

/** Waits past the server's "no step faster than 1 s" plausibility rule, then taps an option twice (hear, then choose). */
export async function chooseOption(page, id) {
  await page.waitForTimeout(1200);
  const card = page.locator(`.card[data-option=${id}]`);
  await card.click();
  await card.click();
}

export async function doParts(page, order) {
  await page.waitForTimeout(1200);
  for (const id of order) await page.locator(`.card[data-part=${id}]`).click();
}

export const text = async (page, sel = 'main') => (await page.locator(sel).first().innerText()).replace(/\n+/g, ' / ');
