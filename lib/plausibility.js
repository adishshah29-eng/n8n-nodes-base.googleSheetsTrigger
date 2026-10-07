export const MIN_STEP_MS = 1000;
export const MIN_TOTAL_MS = 5000;
export const MAX_TOTAL_MS = 60 * 60 * 1000;

/**
 * Returns a reason string if a PASSED attempt looks fabricated, else null.
 * Failed attempts earn nothing, so they are not checked.
 */
export function plausibilityFlag(attempt, scenario) {
  if (!attempt.passed) return null;
  if (!scenario) return 'unknown scenario';
  if (attempt.score < scenario.passScore) return 'score below pass mark';

  const byStep = new Map(attempt.steps.map((s) => [s?.stepId, s]));
  for (const step of scenario.steps) {
    if (step.type === 'hazard') continue; // watched, not recorded
    if (!byStep.has(step.id)) return `step ${step.id} missing`;
  }
  for (const s of attempt.steps) {
    if (!Number.isFinite(s?.decisionMs) || s.decisionMs < MIN_STEP_MS) return `step ${s?.stepId} too fast`;
  }
  if (attempt.durationMs < MIN_TOTAL_MS || attempt.durationMs > MAX_TOTAL_MS) return 'duration out of range';
  return null;
}
