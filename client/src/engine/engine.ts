import type { AttemptResult, Option, Scenario, Step, StepRecord } from './types';

export type Status = 'running' | 'passed' | 'failed';

/**
 * Plays a scenario step by step. Knows nothing about fire or conveyors.
 * - correct choice: awards its points and moves on
 * - wrong choice: records the try; the same step is replayed
 * - critical choice (or timing out on a choice): fails the attempt immediately
 */
export class ScenarioEngine {
  status: Status = 'running';
  score = 0;
  criticalFail = false;
  private index = 0;
  private records: StepRecord[] = [];
  private startedAt: number;

  constructor(
    private scenario: Scenario,
    private now: () => number = () => Date.now(),
  ) {
    this.startedAt = now();
  }

  get step(): Step | undefined {
    return this.status === 'running' ? this.scenario.steps[this.index] : undefined;
  }

  /** Hazard steps are only watched; advance to the next step. */
  continue(): void {
    this.requireStep('hazard');
    this.advance();
  }

  choose(optionId: string, decisionMs: number): Option {
    const step = this.requireStep('choice');
    if (step.type !== 'choice') throw new Error('not a choice step');
    const option = step.options.find((o) => o.id === optionId);
    if (!option) throw new Error(`unknown option ${optionId}`);
    this.record(step.id, decisionMs, optionId);

    if (option.critical) {
      this.criticalFail = true;
      this.status = 'failed';
    } else if (option.correct) {
      this.score += option.points ?? 0;
      this.advance(option.next);
    }
    return option;
  }

  /** Running out of time on a choice counts as a wrong, non-critical choice. */
  timeout(): void {
    const step = this.requireStep('choice');
    this.record(step.id, (step.timeLimit ?? 0) * 1000);
  }

  completeAction(decisionMs: number): void {
    const step = this.requireStep('action');
    if (step.type !== 'action') throw new Error('not an action step');
    this.record(step.id, decisionMs);
    this.score += step.points ?? 0;
    this.advance();
  }

  result(): AttemptResult {
    if (this.status === 'running') throw new Error('scenario not finished');
    return {
      scenarioId: this.scenario.id,
      score: this.score,
      passed: this.status === 'passed',
      criticalFail: this.criticalFail,
      steps: this.records,
      durationMs: this.now() - this.startedAt,
    };
  }

  private requireStep(type: Step['type']): Step {
    const step = this.step;
    if (!step || step.type !== type) throw new Error(`expected a ${type} step`);
    return step;
  }

  private record(stepId: string, decisionMs: number, optionId?: string): StepRecord {
    const existing = this.records.find((r) => r.stepId === stepId);
    if (existing) {
      existing.tries += 1;
      existing.optionId = optionId;
      existing.decisionMs = decisionMs;
      existing.choices?.push(optionId ?? 'timeout');
      return existing;
    }
    const rec: StepRecord = { stepId, optionId, decisionMs, tries: 1 };
    if (optionId !== undefined || this.scenario.steps.find((s) => s.id === stepId)?.type === 'choice') {
      rec.choices = [optionId ?? 'timeout'];
    }
    this.records.push(rec);
    return rec;
  }

  private advance(next?: string): void {
    const step = this.scenario.steps[this.index];
    const target = next ?? step.next;
    if (!target || target === 'end') {
      this.status = this.score >= this.scenario.passScore ? 'passed' : 'failed';
      return;
    }
    const i = this.scenario.steps.findIndex((s) => s.id === target);
    if (i < 0) throw new Error(`unknown step ${target}`);
    this.index = i;
  }
}
