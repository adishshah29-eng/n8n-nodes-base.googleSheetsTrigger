import { el } from '../dom';
import { icon } from '../icons';
import type { Step } from '../engine/types';
import type { CameraProblem } from './camera';
import type { Stage, StageEffect, StageInfo } from './types';

/** Last-resort 2D stage (a big picture) for phones without WebGL. */
export class FlatStage implements Stage {
  readonly info: StageInfo;
  constructor(problem?: CameraProblem) {
    this.info = { mode: 'flat', problem };
  }
  private box = el('div', undefined, 'stage-flat');
  private picture = el('div', undefined, 'stage-picture');

  async mount(host: HTMLElement) {
    this.box.append(this.picture);
    host.prepend(this.box);
  }

  show(_scenarioId: string, step: Step) {
    this.picture.textContent = step.icon ? icon(step.icon) : '';
  }

  effect(e: StageEffect) {
    const name = typeof e === 'string' ? e : 'part';
    this.box.classList.remove('fx-wrong', 'fx-critical', 'fx-success', 'fx-part');
    void this.box.offsetWidth; // restart the CSS animation
    this.box.classList.add(`fx-${name}`);
  }

  onTracking(cb: (found: boolean) => void) {
    cb(true); // nothing to lose track of
  }

  destroy() {
    this.box.remove();
  }
}
