// Compiles markers/*.png into content/targets/targets.mind using MindAR's browser compiler,
// run in headless Chromium (MindAR's Node compiler needs the native `canvas` module).
// Image order = scenario `target` index; see MARKERS in make-markers.mjs.
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKERS } from './make-markers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const bundle = await build({
  entryPoints: [join(here, '../node_modules/mind-ar/dist/mindar-image.prod.js')],
  bundle: true, format: 'iife', write: false, logLevel: 'error',
  // tfjs carries Node-only branches (require('util') ...) that never run in a browser; leave them unresolved.
  external: ['util', 'buffer', 'fs', 'path', 'os', 'crypto', 'stream', 'zlib', 'http', 'https', 'url', 'child_process', 'canvas', 'worker_threads', 'perf_hooks'],
});
const images = MARKERS.map((m) => `data:image/png;base64,${readFileSync(join(root, 'markers', `${m.code}.png`)).toString('base64')}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('about:blank');
await page.addScriptTag({ content: bundle.outputFiles[0].text });

const b64 = await page.evaluate(async (urls) => {
  const imgs = await Promise.all(urls.map((u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; })));
  const compiler = new window.MINDAR.IMAGE.Compiler();
  await compiler.compileImageTargets(imgs, (p) => console.log('progress', Math.round(p)));
  const buf = new Uint8Array(await compiler.exportData());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}, images);
await browser.close();

const outDir = join(root, 'content/targets');
mkdirSync(outDir, { recursive: true });
const data = Buffer.from(b64, 'base64');
writeFileSync(join(outDir, 'targets.mind'), data);
console.log(`targets.mind: ${(data.length / 1024).toFixed(0)} KB for ${MARKERS.length} targets (${MARKERS.map((m) => m.code).join(', ')})`);
