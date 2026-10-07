// Generates the printable AR markers (PNG for the compiler, A4 PDF for printing).
// These are PLACEHOLDERS: MindAR tracks visual texture, so for the real demo replace the
// artwork with a photo of the actual panel/conveyor (bold border + station code kept), then
// re-run `npm run targets` so targets.mind matches the new images.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '../../markers');
mkdirSync(out, { recursive: true });

// Order matters: the index here is the scenario's `target` number in content/scenarios/*.json.
export const MARKERS = [
  { code: 'M102', title: 'Electrical panel', seed: 102 },
  { code: 'M205', title: 'Conveyor C-2', seed: 205 },
];

const rng = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const PALETTE = ['#e63946', '#f1c40f', '#2a9d8f', '#264653', '#ff7f11', '#6a4c93', '#111111', '#ffffff', '#3a86ff'];

export function markerSvg({ code, title, seed }) {
  const r = rng(seed);
  const pick = () => PALETTE[Math.floor(r() * PALETTE.length)];
  let shapes = '';
  for (let i = 0; i < 170; i++) {
    const x = 50 + r() * 900, y = 50 + r() * 760, s = 25 + r() * 130, c = pick();
    const k = Math.floor(r() * 3);
    if (k === 0) shapes += `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${c}"/>`;
    else if (k === 1) shapes += `<rect x="${x}" y="${y}" width="${s}" height="${s * (0.3 + r())}" fill="${c}" transform="rotate(${r() * 90} ${x} ${y})"/>`;
    else shapes += `<polygon points="${x},${y} ${x + s},${y + r() * s} ${x + r() * s},${y + s}" fill="${c}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <rect width="1000" height="1000" fill="#fff"/>
  <clipPath id="c"><rect x="40" y="40" width="920" height="780"/></clipPath>
  <g clip-path="url(#c)">${shapes}</g>
  <rect x="20" y="20" width="960" height="800" fill="none" stroke="#000" stroke-width="40"/>
  <rect x="0" y="820" width="1000" height="180" fill="#000"/>
  <text x="60" y="935" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="120" fill="#fff">${code}</text>
  <text x="940" y="930" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="52" fill="#f1c40f">${title}</text>
</svg>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  for (const m of MARKERS) {
    const svg = markerSvg(m);
    writeFileSync(join(out, `${m.code}.svg`), svg);
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.screenshot({ path: join(out, `${m.code}.png`), clip: { x: 0, y: 0, width: 1000, height: 1000 } });
    await page.setContent(`<style>@page{size:A4;margin:0}body{margin:0;font-family:Arial,sans-serif;text-align:center}
      .m{width:18cm;height:18cm;margin:1.5cm auto 0}.m svg{width:100%;height:100%}
      p{font-size:11pt;color:#444;margin:.6cm 2cm}</style>
      <div class="m">${svg}</div>
      <p><b>${m.code} — ${m.title}</b></p>
      <p>Print at 100% on A4, matte paper. Laminate with matte film (glare breaks tracking). Fix flat at eye level beside the equipment.</p>`);
    await page.pdf({ path: join(out, `${m.code}.pdf`), format: 'A4', printBackground: true });
    console.log('wrote', m.code);
  }
  await browser.close();
}
