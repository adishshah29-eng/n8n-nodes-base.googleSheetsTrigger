import type { Scenario } from '../engine/types';
import { FlatStage } from './flat';
import type { Stage } from './types';

/** Picks the visual layer for a scenario. Always resolves: if AR cannot start, the 2D stage takes over. */
export async function createStage(_scenario: Scenario): Promise<Stage> {
  return new FlatStage();
}
