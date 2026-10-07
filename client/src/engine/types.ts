export interface Option {
  id: string;
  icon: string;
  correct: boolean;
  critical?: boolean;
  points?: number;
  feedback?: string;
  next?: string;
}

interface BaseStep {
  id: string;
  audio?: string;
  model?: string;
  timeLimit?: number;
  next?: string;
}

export type Step =
  | (BaseStep & { type: 'hazard' })
  | (BaseStep & { type: 'choice'; options: Option[] })
  | (BaseStep & { type: 'action'; gesture: string; points?: number });

export interface Scenario {
  id: string;
  target: number;
  passScore: number;
  steps: Step[];
}

/** Per-step record kept for the admin dashboard. */
export interface StepRecord {
  stepId: string;
  optionId?: string;
  decisionMs: number;
  tries: number;
}

export interface AttemptResult {
  scenarioId: string;
  score: number;
  passed: boolean;
  criticalFail: boolean;
  steps: StepRecord[];
  durationMs: number;
}
