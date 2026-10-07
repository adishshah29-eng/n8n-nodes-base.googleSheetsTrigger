import * as THREE from 'three';

// Procedural textures, drawn once on a canvas and cached. Nothing to download, so the install stays
// small and everything works offline. Sizes are kept modest for mid-range phone GPUs.

const cache = new Map<string, THREE.Texture>();
const memo = <T extends THREE.Texture>(key: string, make: () => T): T => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
};

/** Seeded PRNG, so textures look the same on every phone and every run. */
export const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Tileable value noise on an integer lattice of `period` cells; fbm sums octaves. */
function makeNoise(seed: number) {
  const r = rng(seed);
  const N = 256;
  const table = Float32Array.from({ length: N * N }, () => r());
  const lattice = (x: number, y: number, period: number) => table[((((y % period) + period) % period) * N + (((x % period) + period) % period)) % (N * N)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number, period: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth(x - xi), v = smooth(y - yi);
    const a = lattice(xi, yi, period), b = lattice(xi + 1, yi, period);
    const c = lattice(xi, yi + 1, period), d = lattice(xi + 1, yi + 1, period);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  /** fbm in [0,1] for texture coords u,v in [0,1); tiles seamlessly. */
  return (u: number, v: number, base = 4, octaves = 4) => {
    let sum = 0, amp = 0.5, norm = 0, p = base;
    for (let o = 0; o < octaves; o++) {
      sum += amp * value(u * p, v * p, p);
      norm += amp;
      amp *= 0.5;
      p *= 2;
    }
    return sum / norm;
  };
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const hexToRgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/**
 * Painted sheet steel: colour variation, a little grime that collects toward the bottom, fine scratches.
 * Returns a colour map and a matching roughness map (scratches are shinier, grime is duller).
 */
export function paintedSteel(hex: number, { grime = 0.5, seed = 1, size = 512 } = {}) {
  const key = `paint-${hex}-${grime}-${seed}`;
  const map = memo(key, () => {
    const noise = makeNoise(seed);
    const [R, G, B] = hexToRgb(hex);
    const col = canvas(size);
    const rough = canvas(size);
    const ci = col.ctx.createImageData(size, size);
    const ri = rough.ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const n = noise(u, v, 3, 4);
        const fine = noise(u, v, 32, 2);
        const dirt = Math.max(0, noise(u + 0.37, v + 0.11, 2, 3) - 0.45) * 2 * grime * (0.35 + 0.65 * v);
        const k = (0.93 + 0.1 * n + 0.04 * fine) * (1 - 0.45 * dirt);
        const i = (y * size + x) * 4;
        ci.data[i] = Math.min(255, R * k + 20 * dirt);
        ci.data[i + 1] = Math.min(255, G * k + 14 * dirt);
        ci.data[i + 2] = Math.min(255, B * k + 6 * dirt);
        ci.data[i + 3] = 255;
        const rv = 120 + 50 * dirt * 2 + 25 * fine;
        ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.min(255, rv);
        ri.data[i + 3] = 255;
      }
    col.ctx.putImageData(ci, 0, 0);
    rough.ctx.putImageData(ri, 0, 0);
    const r = rng(seed + 9);
    for (let s = 0; s < 70 * grime + 10; s++) {
      const x = r() * size, y = r() * size, len = 6 + r() * 40, a = r() * Math.PI;
      for (const [ctx, style] of [[col.ctx, 'rgba(255,255,255,0.18)'], [rough.ctx, 'rgba(40,40,40,0.9)']] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = 0.6 + r() * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
    }
    cache.set(`${key}-rough`, toTexture(rough.c, false, true));
    return toTexture(col.c, true, true);
  });
  return { map, roughnessMap: cache.get(`${key}-rough`)! };
}

/** Brushed metal: directional streaks, used as a roughness map on steel and aluminium. */
export function brushed(seed = 3) {
  return memo(`brushed-${seed}`, () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    const r = rng(seed);
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const y = r() * size;
      const g = 90 + Math.floor(r() * 90);
      ctx.strokeStyle = `rgba(${g},${g},${g},0.35)`;
      ctx.lineWidth = 0.5 + r();
      ctx.beginPath();
      const x = r() * size;
      ctx.moveTo(x - 80, y);
      ctx.lineTo(x + 80, y + (r() - 0.5) * 2);
      ctx.stroke();
    }
    return toTexture(c, false, true);
  });
}

/** Conveyor belt rubber with raised chevron cleats; tiles along U so it can scroll. */
export function beltRubber() {
  return memo('belt', () => {
    const w = 512, h = 128;
    const { c, ctx } = canvas(w, h);
    const noise = makeNoise(21);
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const n = noise(x / w, y / h, 8, 3);
        const g = 26 + 22 * n;
        const i = (y * w + x) * 4;
        img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g + 2; img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#3d3d40';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 4, 18);
      ctx.lineTo(x + 30, h / 2);
      ctx.lineTo(x + 4, h - 18);
      ctx.stroke();
    }
    // dust from the ore
    const r = rng(22);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${120 + r() * 40},${80 + r() * 30},${50 + r() * 20},${0.15 + r() * 0.25})`;
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    return toTexture(c, true, true);
  });
}

/** Concrete for the 3D-viewer wall and floor (not used in AR, where the real world is the backdrop). */
export function concrete(seed = 5, tint = 0x8a8984) {
  return memo(`concrete-${seed}-${tint}`, () => {
    const size = 512;
    const { c, ctx } = canvas(size);
    const noise = makeNoise(seed);
    const [R, G, B] = hexToRgb(tint);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const k = 0.78 + 0.28 * noise(u, v, 4, 5) + 0.06 * noise(u, v, 64, 1);
        const i = (y * size + x) * 4;
        img.data[i] = R * k; img.data[i + 1] = G * k; img.data[i + 2] = B * k; img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const r = rng(seed + 1);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(30,30,30,${0.1 + r() * 0.25})`;
      const s = 1 + r() * 3;
      ctx.beginPath();
      ctx.arc(r() * size, r() * size, s, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c, true, true);
  });
}

/** Rotating-machine guard: expanded-metal mesh as an alpha map. */
export function meshGrid() {
  return memo('mesh', () => {
    const size = 128;
    const { c, ctx } = canvas(size);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    for (let i = -size; i < size * 2; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, size); ctx.lineTo(i + size, 0); ctx.stroke();
    }
    return toTexture(c, false, true);
  });
}

/** Soft black soot / scorch mark as a transparent decal. */
export function scorch() {
  return memo('scorch', () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    const noise = makeNoise(31);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = x / size - 0.5, dy = (y / size - 0.62) * 1.3;
        const d = Math.sqrt(dx * dx + dy * dy) * 2;
        const n = noise(x / size, y / size, 4, 4);
        const a = Math.max(0, 1 - d - (0.5 - n) * 0.9) ** 1.4;
        const i = (y * size + x) * 4;
        img.data[i] = 12; img.data[i + 1] = 10; img.data[i + 2] = 8; img.data[i + 3] = Math.min(255, a * 255);
      }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, true);
  });
}

/** Black-and-yellow hazard stripes. */
export function hazardStripes() {
  return memo('hazard', () => {
    const { c, ctx } = canvas(256, 64);
    ctx.fillStyle = '#f2c300';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#1a1a1a';
    for (let x = -64; x < 256 + 64; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 64); ctx.lineTo(x + 24, 64); ctx.lineTo(x + 24 + 32, 0); ctx.lineTo(x + 32, 0);
      ctx.fill();
    }
    return toTexture(c, true, true);
  });
}

type LabelLine = { text: string; size: number; color?: string; weight?: string; y: number };

/**
 * Printed labels and signs (DANGER 415 V, the extinguisher wrap, the lockout tag). Drawn as text on
 * a canvas so they stay crisp and need no image files.
 */
export function label(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  return memo(`label-${key}`, () => {
    const { c, ctx } = canvas(w, h);
    draw(ctx, w, h);
    return toTexture(c, true);
  });
}

export function textLines(ctx: CanvasRenderingContext2D, w: number, lines: LabelLine[]) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of lines) {
    ctx.fillStyle = l.color ?? '#111';
    ctx.font = `${l.weight ?? '700'} ${l.size}px Arial, Helvetica, sans-serif`;
    ctx.fillText(l.text, w / 2, l.y);
  }
}

/** Studio backdrop for the 3D viewer: a soft vertical gradient. */
export function backdrop() {
  return memo('backdrop', () => {
    const { c, ctx } = canvas(16, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1d2733');
    g.addColorStop(1, '#0b0f14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    return toTexture(c, true);
  });
}
