/**
 * For each choice step: how often each WRONG option was the worker's first pick.
 * This is the insight a safety officer can act on ("38% reach for water first").
 *
 * @param attempts   [{ scenario_id, steps }]
 * @param scenarios  { [id]: scenario definition }
 */
export function wrongFirstChoices(attempts, scenarios) {
  const tally = new Map(); // `${scenario}|${step}` -> { reached, wrong: Map(option -> n) }
  for (const a of attempts) {
    const scenario = scenarios[a.scenario_id];
    if (!scenario) continue;
    for (const rec of a.steps ?? []) {
      const step = scenario.steps.find((s) => s.id === rec.stepId);
      if (step?.type !== 'choice') continue;
      const first = rec.choices?.[0] ?? rec.optionId;
      if (!first) continue;
      const key = `${a.scenario_id}|${step.id}`;
      const t = tally.get(key) ?? { scenarioId: a.scenario_id, stepId: step.id, reached: 0, wrong: new Map() };
      t.reached += 1;
      const opt = step.options.find((o) => o.id === first);
      if (first === 'timeout' || (opt && !opt.correct)) t.wrong.set(first, (t.wrong.get(first) ?? 0) + 1);
      tally.set(key, t);
    }
  }
  const out = [];
  for (const t of tally.values()) {
    for (const [optionId, count] of t.wrong) {
      out.push({ scenarioId: t.scenarioId, stepId: t.stepId, optionId, count, reached: t.reached, share: count / t.reached });
    }
  }
  return out.sort((a, b) => b.share - a.share || b.count - a.count);
}

export function certStatus(c, now = new Date()) {
  if (!c?.id) return 'none';
  if (c.revoked_at) return 'revoked';
  if (new Date(c.expires_at) <= now) return 'expired';
  return 'valid';
}
