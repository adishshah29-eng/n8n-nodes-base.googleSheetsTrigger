const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

export const MAX_BATCH = 50;

/** Returns an error string, or null if the attempt is well-formed. */
export function validateAttempt(a) {
  if (!a || typeof a !== 'object') return 'not an object';
  if (typeof a.id !== 'string' || !UUID.test(a.id)) return 'id must be a UUID';
  if (typeof a.scenarioId !== 'string' || !a.scenarioId) return 'scenarioId required';
  if (!Number.isInteger(a.score) || a.score < 0 || a.score > 1000) return 'score must be an integer 0-1000';
  if (typeof a.passed !== 'boolean') return 'passed must be a boolean';
  if (a.criticalFail !== undefined && typeof a.criticalFail !== 'boolean') return 'criticalFail must be a boolean';
  if (a.criticalFail && a.passed) return 'a critical fail cannot be a pass';
  if (!Array.isArray(a.steps) || a.steps.length === 0 || a.steps.length > 100) return 'steps must be a non-empty array';
  if (!Number.isInteger(a.durationMs) || a.durationMs < 0 || a.durationMs > 24 * 3600 * 1000) return 'durationMs out of range';
  if (typeof a.deviceTime !== 'string' || Number.isNaN(Date.parse(a.deviceTime))) return 'deviceTime must be an ISO date';
  return null;
}
