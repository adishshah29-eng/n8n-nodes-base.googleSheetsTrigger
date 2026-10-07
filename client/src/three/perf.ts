import * as THREE from 'three';

/**
 * Dynamic resolution: keeps the frame rate near the 30 fps cap on whatever phone it runs on. If frames
 * arrive slower than ~24 fps for a while, render fewer pixels (pixel fill is the main cost of the PBR
 * scene); when there is headroom again, step back up toward full sharpness.
 */
export class AdaptiveResolution {
  private ratio: number;
  private window: number[] = [];
  private lastFrame = 0;
  private calm = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private max: number,
    private min = 0.6,
  ) {
    this.ratio = max;
    this.set(max);
  }

  get pixelRatio() {
    return this.ratio;
  }

  /** Call once per rendered frame with the rAF timestamp (ms). */
  tick(time: number) {
    if (this.lastFrame) this.window.push(time - this.lastFrame);
    this.lastFrame = time;
    if (this.window.length < 20) return;
    const avg = this.window.reduce((a, b) => a + b, 0) / this.window.length;
    this.window.length = 0;
    if (avg > 42 && this.ratio > this.min) {
      this.set(Math.max(this.min, this.ratio * 0.82)); // under ~24 fps: drop resolution
      this.calm = 0;
    } else if (avg < 36 && this.ratio < this.max) {
      if (++this.calm >= 3) {
        this.set(Math.min(this.max, this.ratio * 1.1)); // steady at the cap for ~2 s: sharpen again
        this.calm = 0;
      }
    } else this.calm = 0;
  }

  private set(r: number) {
    this.ratio = r;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setPixelRatio(r);
    this.renderer.setSize(size.x, size.y, false);
  }
}

/** `?debug=1`: a small readout for testing on a real phone (fps, render scale, tier, camera resolution). */
export function debugOverlay(host: HTMLElement, read: () => Record<string, string | number>): { frame(): void; dispose(): void } {
  if (new URLSearchParams(location.search).get('debug') !== '1') return { frame() {}, dispose() {} };
  const box = document.createElement('div');
  box.className = 'debug-overlay';
  host.append(box);
  let frames = 0;
  let since = performance.now();
  const id = setInterval(() => {
    const now = performance.now();
    const fps = (frames * 1000) / (now - since);
    frames = 0;
    since = now;
    box.textContent = Object.entries({ fps: fps.toFixed(1), ...read() }).map(([k, v]) => `${k} ${v}`).join(' · ');
  }, 1000);
  return {
    frame: () => void frames++,
    dispose: () => (clearInterval(id), box.remove()),
  };
}
