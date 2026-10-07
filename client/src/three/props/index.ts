import { conveyorJam } from './conveyor';
import { extinguisher } from './extinguisher';
import { isolator } from './isolator';
import { panelFire } from './panel';
import type { Prop } from './common';

export type { Frame, Prop } from './common';

/** Scenario step `model` name -> prop factory. */
export const PROPS: Record<string, () => Prop> = {
  panel_fire: panelFire,
  co2_extinguisher: extinguisher,
  conveyor_jam: conveyorJam,
  isolator,
};
