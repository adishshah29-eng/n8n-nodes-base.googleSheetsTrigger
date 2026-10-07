/**
 * Counts time for one step and can pause (marker lost) without losing what already elapsed.
 * Optionally fires `onExpire` once the *unpaused* time reaches `limitMs`.
 */
export class PausableTimer {
  private elapsedBefore = 0;
  private runningSince: number | null = null;
  private handle: ReturnType<typeof setTimeout> | null = null;
  private expired = false;

  constructor(
    private limitMs: number | null,
    private onExpire: () => void = () => {},
    private now: () => number = () => Date.now(),
  ) {}

  start(): this {
    this.resume();
    return this;
  }

  get elapsed(): number {
    return this.elapsedBefore + (this.runningSince === null ? 0 : this.now() - this.runningSince);
  }

  get fraction(): number {
    return this.limitMs ? Math.min(1, this.elapsed / this.limitMs) : 0;
  }

  get paused(): boolean {
    return this.runningSince === null;
  }

  pause(): void {
    if (this.runningSince === null) return;
    this.elapsedBefore += this.now() - this.runningSince;
    this.runningSince = null;
    this.clear();
  }

  resume(): void {
    if (this.runningSince !== null || this.expired) return;
    this.runningSince = this.now();
    if (this.limitMs !== null) {
      this.handle = setTimeout(() => {
        this.expired = true;
        this.elapsedBefore = this.limitMs!;
        this.runningSince = null;
        this.onExpire();
      }, Math.max(0, this.limitMs - this.elapsedBefore));
    }
  }

  /** Stops the timer for good and returns the elapsed milliseconds. */
  stop(): number {
    const e = this.elapsed;
    this.pause();
    this.expired = true;
    return e;
  }

  private clear() {
    if (this.handle !== null) clearTimeout(this.handle);
    this.handle = null;
  }
}
