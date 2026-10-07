import * as THREE from 'three';

// Fire and smoke are animated sprite sheets on billboards, not particle systems: far cheaper on a
// mid-range phone GPU. The sheets are drawn procedurally at start-up, so there is no image to ship.

const mulberry = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function sheet(frames: number, size: number, draw: (ctx: CanvasRenderingContext2D, f: number, ox: number, size: number) => void) {
  const c = document.createElement('canvas');
  c.width = size * frames;
  c.height = size;
  const ctx = c.getContext('2d')!;
  for (let f = 0; f < frames; f++) draw(ctx, f, f * size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const FLAME_FRAMES = 8;
export const SMOKE_FRAMES = 6;

export function flameSheet(size = 128): THREE.CanvasTexture {
  const r = mulberry(7);
  const layers = ['rgba(200,30,0,0.85)', 'rgba(255,100,0,0.9)', 'rgba(255,170,20,0.95)', 'rgba(255,240,150,1)'];
  return sheet(FLAME_FRAMES, size, (ctx, _f, ox, s) => {
    layers.forEach((color, k) => {
      const w = s * (0.3 + 0.1 * r()) * (1 - k * 0.2);
      const h = s * (0.62 + 0.3 * r()) * (1 - k * 0.14);
      const cx = ox + s / 2 + (r() - 0.5) * s * 0.14;
      const base = s * 0.96;
      const g = ctx.createRadialGradient(cx, base - h * 0.35, 2, cx, base - h * 0.35, h * 0.62);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx + (r() - 0.5) * w * 0.5, base - h);
      ctx.quadraticCurveTo(cx + w * 1.1, base - h * 0.35, cx, base);
      ctx.quadraticCurveTo(cx - w * 1.1, base - h * 0.35, cx + (r() - 0.5) * w * 0.5, base - h);
      ctx.fill();
    });
  });
}

export function smokeSheet(size = 128): THREE.CanvasTexture {
  const r = mulberry(11);
  return sheet(SMOKE_FRAMES, size, (ctx, _f, ox, s) => {
    for (let i = 0; i < 7; i++) {
      const x = ox + s * (0.25 + 0.5 * r());
      const y = s * (0.25 + 0.5 * r());
      const rad = s * (0.16 + 0.16 * r());
      const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
      g.addColorStop(0, 'rgba(70,70,75,0.55)');
      g.addColorStop(1, 'rgba(70,70,75,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** A billboard that steps through the frames of a sprite sheet. */
export class SheetSprite {
  readonly sprite: THREE.Sprite;
  private tex: THREE.Texture;
  private t = Math.random() * 10; // desynchronise neighbours

  constructor(
    source: THREE.CanvasTexture,
    private frames: number,
    private fps: number,
    additive = false,
  ) {
    this.tex = source.clone();
    this.tex.needsUpdate = true;
    this.tex.repeat.set(1 / frames, 1);
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.tex,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
  }

  get opacity() {
    return this.sprite.material.opacity;
  }
  set opacity(v: number) {
    this.sprite.material.opacity = v;
  }

  update(dt: number) {
    this.t += dt;
    this.tex.offset.x = (Math.floor(this.t * this.fps) % this.frames) / this.frames;
  }

  dispose() {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}
