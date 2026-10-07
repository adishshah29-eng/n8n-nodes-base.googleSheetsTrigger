import type { StringKey } from '../i18n';

export type ResultKind = 'passed' | 'failed' | 'critical';

export interface ResultSummary {
  passed: boolean;
  criticalFail: boolean;
}

/** A critical mistake outranks everything else, as it would on site. */
export function resultKind(a: ResultSummary): ResultKind {
  if (a.criticalFail) return 'critical';
  return a.passed ? 'passed' : 'failed';
}

export const TEXT: Record<ResultKind, { title: StringKey; message: StringKey; banner: 'ok' | 'bad' | 'warn' }> = {
  passed: { title: 'passedTitle', message: 'passedMsg', banner: 'ok' },
  failed: { title: 'failedTitle', message: 'failedMsg', banner: 'warn' },
  critical: { title: 'criticalTitle', message: 'criticalMsg', banner: 'bad' },
};
