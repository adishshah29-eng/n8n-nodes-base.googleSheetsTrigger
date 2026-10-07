import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PausableTimer } from './timer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const make = (limit: number | null, onExpire = vi.fn()) =>
  ({ t: new PausableTimer(limit, onExpire, () => Date.now()).start(), onExpire });

describe('PausableTimer', () => {
  it('expires after the limit', () => {
    const { t, onExpire } = make(5000);
    vi.advanceTimersByTime(4999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(t.elapsed).toBe(5000);
  });

  it('does not count paused time (marker lost) toward the limit', () => {
    const { t, onExpire } = make(5000);
    vi.advanceTimersByTime(3000);
    t.pause();
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(t.elapsed).toBe(3000);
    t.resume();
    vi.advanceTimersByTime(1999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it('measures elapsed with no limit and stops cleanly', () => {
    const { t } = make(null);
    vi.advanceTimersByTime(1234);
    expect(t.stop()).toBe(1234);
    vi.advanceTimersByTime(5000);
    expect(t.elapsed).toBe(1234);
  });

  it('never fires after stop', () => {
    const { t, onExpire } = make(1000);
    t.stop();
    vi.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('reports the fraction used', () => {
    const { t } = make(10_000);
    vi.advanceTimersByTime(2500);
    expect(t.fraction).toBeCloseTo(0.25);
  });
});
