import type { Scenario, Step } from '../engine/types';
import { deviceTier } from '../three/quality';
import { CameraError, type CameraProblem } from './camera';
import { FlatStage } from './flat';
import type { Stage, StageEffect, StageInfo } from './types';

/**
 * Best stage the phone can run, in order: AR on the marker -> 3D viewer (no camera) -> 2D picture
 * (no WebGL). The scenario always plays. `?ar=0` skips AR; `?quality=low|high` overrides the device tier.
 * The 3D modules are loaded on demand, so the home screen stays light.
 */
class AutoStage implements Stage {
  private inner: Stage = new FlatStage();
  private ready = false;

  constructor(private scenario: Scenario) {}

  get info(): StageInfo {
    return this.inner.info ?? { mode: 'flat' };
  }

  async mount(host: HTMLElement) {
    const tier = deviceTier();
    let problem: CameraProblem | undefined;
    if (new URLSearchParams(location.search).get('ar') !== '0') {
      const { ARStage } = await import('./ar');
      const ar = new ARStage(this.scenario, tier);
      try {
        await ar.mount(host);
        return this.use(ar);
      } catch (e) {
        problem = e instanceof CameraError ? e.problem : 'failed';
        console.warn('AR unavailable:', problem, e);
        ar.destroy();
      }
    }
    const { ViewerStage, hasWebGL } = await import('./viewer');
    if (hasWebGL()) {
      const viewer = new ViewerStage(tier, problem);
      try {
        await viewer.mount(host);
        return this.use(viewer);
      } catch (e) {
        console.warn('3D viewer unavailable:', e);
        viewer.destroy();
      }
    }
    const flat = new FlatStage(problem);
    await flat.mount(host);
    this.use(flat);
  }

  private use(stage: Stage) {
    this.inner = stage;
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
