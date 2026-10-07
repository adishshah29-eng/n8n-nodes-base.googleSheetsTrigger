// Renders the PWA icons into content/icons/ (served from the site root as /icons/*).
// Edit ICON below and re-run `npm run icons` to restyle.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '../../content/icons');
mkdirSync(out, { recursive: true });

// A shield with an "A". `inset` shrinks the artwork so a maskable icon keeps it inside the safe zone.
const icon = (inset) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111827"/>
  <g transform="translate(256 256) scale(${1 - inset}) translate(-256 -256)">
    <path d="M256 70 L420 128 V252 C420 352 350 424 256 450 C162 424 92 352 92 252 V128 Z" fill="#16a34a"/>
    <path d="M256 70 L420 128 V252 C420 352 350 424 256 450 Z" fill="#15803d"/>
    <text x="256" y="320" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="230" fill="#fff">A</text>
  </g>
</svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  { file: 'maskable-512.png', size: 512, inset: 0.18 }, // Android crops maskable icons to a circle/squircle
  { file: 'apple-touch-icon.png', size: 180, inset: 0.06 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
for (const { file, size, inset } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${icon(inset).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
  await page.screenshot({ path: join(out, file) });
  await page.close();
  console.log('wrote', file);
}
await browser.close();
