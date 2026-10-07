import type { Step } from '../engine/types';
import type { CameraProblem } from './camera';

export type StageEffect = 'wrong' | 'critical' | 'success' | { part: string };

/** Which stage is showing, and if it is not AR, why the camera could not be used. */
export interface StageInfo {
  mode: 'ar' | 'viewer' | 'flat';
  problem?: CameraProblem;
}

/**
 * What the scenario screen needs from the visual layer behind the UI. The AR stage, the 3D viewer and the
 * 2D fallback implement the same interface, so the scenario logic never knows which it has.
 */
export interface Stage {
  /** Adds the stage's elements to `host` (behind the overlay). Rejects if it cannot start, e.g. no camera. */
  mount(host: HTMLElement): Promise<void>;
  show(scenarioId: string, step: Step): void;
  effect(e: StageEffect): void;
  /** Called with false when the marker is lost and true when it is found again. */
  onTracking(cb: (found: boolean) => void): void;
  destroy(): void;
  readonly info?: StageInfo;
}
