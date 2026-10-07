import type { Scenario } from '../engine/types';

export interface Overview {
  scenarios: { scenario_id: string; attempts: number; passed: number; critical: number; passRate: number }[];
  wrongFirstChoices: { scenarioId: string; stepId: string; optionId: string; count: number; reached: number; share: number }[];
  totals: { workers: number; valid_certificates: number; flaggedAttempts: number };
  scenarioDefs: Record<string, Scenario>;
}

export interface AttemptRow {
  id: string;
  scenario_id: string;
  score: number;
  passed: boolean;
  critical_fail: boolean;
  flag: string | null;
  duration_ms: number;
  received_at: string;
  name: string;
  employer_id: string;
  site: string | null;
}

export interface AttemptDetail {
  attempt: AttemptRow & {
    photo_url: string | null;
    steps: { stepId: string; optionId?: string; choices?: string[]; decisionMs: number; tries: number }[];
  };
  scenario: Scenario | null;
}

export type CertStatus = 'valid' | 'expired' | 'revoked' | 'none';

export interface WorkerRow {
  id: string;
  name: string;
  employer_id: string;
  site: string | null;
  lang: string;
  last_training: string | null;
  attempts: number;
  certificate: { id: string | null; scenarios: string[] | null; expiresAt: string | null; status: CertStatus };
}

export interface CertRow {
  id: string;
  name: string;
  employer_id: string;
  scenarios: string[];
  score: number;
  issued_at: string;
  expires_at: string;
  status: CertStatus;
}
