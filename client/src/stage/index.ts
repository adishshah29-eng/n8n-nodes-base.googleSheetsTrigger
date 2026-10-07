import type { Scenario, Step } from '../engine/types';
import { FlatStage } from './flat';
import type { Stage, StageEffect } from './types';

const wantsAR = () =>
  !!navigator.mediaDevices?.getUserMedia && new URLSearchParams(location.search).get('ar') !== '0';

/**
 * AR when the phone allows it, otherwise the 2D stage: a denied camera, an old browser, a failed
 * MindAR start. The scenario always plays; AR is an upgrade, never a requirement.
 * `?ar=0` forces 2D.
 */
class AutoStage implements Stage {
  private inner: Stage = new FlatStage();
  private ready = false;

  constructor(private scenario: Scenario) {}

  async mount(host: HTMLElement) {
    if (wantsAR()) {
      const { ARStage } = await import('../ar/stage');
      const ar = new ARStage(this.scenario);
      try {
        await ar.mount(host);
        this.inner = ar;
        this.ready = true;
        return;
      } catch (e) {
        console.warn('AR unavailable, using 2D:', e);
        ar.destroy();
      }
    }
    await this.inner.mount(host);
    this.ready = true;
  }

  show(id: string, step: Step) {
    this.inner.show(id, step);
  }
  effect(e: StageEffect) {
    this.inner.effect(e);
  }
  onTracking(cb: (found: boolean) => void) {
    this.inner.onTracking(cb);
  }
  destroy() {
    if (this.ready) this.inner.destroy();
  }
}

export async function createStage(scenario: Scenario): Promise<Stage> {
  return new AutoStage(scenario);
}
