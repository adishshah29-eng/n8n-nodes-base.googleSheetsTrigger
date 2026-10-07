export type Localized = Partial<Record<'en' | 'hi' | 'sat', string>>;

export interface Option {
  id: string;
  icon: string;
  label?: Localized;
  /** On-screen explanation shown after a wrong choice; the spoken version is the `feedback` clip. */
  feedbackText?: Localized;
  correct: boolean;
  critical?: boolean;
  points?: number;
  feedback?: string;
  next?: string;
}

interface BaseStep {
  id: string;
  icon?: string;
  text?: Localized;
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
  title?: Localized;
  target: number;
  passScore: number;
  steps: Step[];
}

/** Per-step record kept for the admin dashboard. */
export interface StepRecord {
  stepId: string;
  /** The last option chosen. */
  optionId?: string;
  /** Every option tried, in order, so the dashboard can show what workers pick FIRST. */
  choices?: string[];
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
