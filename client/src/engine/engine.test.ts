import { describe, expect, it } from 'vitest';
import scenario from '../../../content/scenarios/fire-panel.json';
import { ScenarioEngine } from './engine';
import type { Scenario } from './types';

const make = () => new ScenarioEngine(scenario as Scenario);

describe('ScenarioEngine (fire-panel)', () => {
  it('passes on the correct path', () => {
    const e = make();
    e.continue();
    e.choose('alarm', 2000);
    e.completeAction(5000);
    const r = e.result();
    expect(r.passed).toBe(true);
    expect(r.score).toBe(70);
  });

  it('fails immediately on a critical choice', () => {
    const e = make();
    e.continue();
    e.choose('water', 1000);
    expect(e.status).toBe('failed');
    expect(e.result().criticalFail).toBe(true);
  });

  it('replays the step after a non-critical wrong choice and counts tries', () => {
    const e = make();
    e.continue();
    e.choose('run', 1000);
    expect(e.step?.id).toBe('s2');
    e.choose('alarm', 1500);
    e.completeAction(4000);
    const r = e.result();
    expect(r.steps.find((s) => s.stepId === 's2')?.tries).toBe(2);
    expect(r.passed).toBe(true);
  });

  it('records every choice tried, in order, including timeouts', () => {
    const e = make();
    e.continue();
    e.timeout();
    e.choose('run', 1500);
    e.choose('alarm', 2000);
    e.completeAction(4000);
    expect(e.result().steps.find((s) => s.stepId === 's2')?.choices).toEqual(['timeout', 'run', 'alarm']);
  });
});
