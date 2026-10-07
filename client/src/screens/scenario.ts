import { playClip } from '../audio/audio';
import gestureData from '../../../content/gestures.json';
import { el } from '../dom';
import { PausableTimer } from '../engine/timer';
import { ScenarioEngine } from '../engine/engine';
import type { Option, Scenario, Step } from '../engine/types';
import { icon } from '../icons';
import { loc, t, type Lang } from '../i18n';
import { db, saveAttempt, type WorkerProfile } from '../store/db';
import type { Stage } from '../stage/types';
import { syncOutbox } from '../sync/sync';
import { renderResult } from './result';

interface GesturePart {
  id: string;
  icon: string;
  label: Record<string, string>;
}
const gestures = gestureData as Record<string, GesturePart[]>;

const PASS_MOMENT_MS = 2500;
const LOST_GRACE_MS = 1500; // marker lost longer than this pauses the step timer
const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern);

const shuffle = <T,>(a: T[]): T[] => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Plays one scenario: the engine decides what happens, the stage shows it, this screen is the
 * overlay (question, cards, timer, feedback). A finished attempt is saved to the outbox and the
 * worker lands on the result screen.
 */
export async function runScenario(
  root: HTMLElement,
  scenario: Scenario,
  worker: WorkerProfile,
  makeStage: (scenario: Scenario) => Promise<Stage>,
) {
  const lang: Lang = worker.lang;
  const clip = (key?: string) => (key ? playClip(lang, `${scenario.id}_${key}`) : Promise.resolve());

  root.replaceChildren();
  const screen = el('main', undefined, 'scenario');
  const bar = el('div', undefined, 'timer-bar');
  const barFill = el('div');
  bar.append(barFill);
  bar.hidden = true;
  const exit = el('a', '✕', 'exit');
  exit.href = '/';
  const logo = el('span', 'Aotan', 'logo');
  const hint = el('div', t(lang, 'pointAtSign'), 'tracking-hint');
  hint.hidden = true;
  const panel = el('div', undefined, 'panel');
  screen.append(bar, exit, logo, hint, panel);
  root.append(screen);

  panel.append(el('p', t(lang, 'loading'), 'step-text')); // camera + AR start can take a few seconds
  const stage = await makeStage(scenario);
  await stage.mount(screen);
  panel.replaceChildren();
  showStageStatus(screen, stage, lang);

  // --- marker tracking: pause the step timer once the marker has been lost for a moment ---
  let timer = null as PausableTimer | null; // assigned inside closures, so widen for TS
  let lostTimeout: ReturnType<typeof setTimeout> | undefined;
  stage.onTracking((found) => {
    clearTimeout(lostTimeout);
    if (found) {
      hint.hidden = true;
      timer?.resume();
    } else {
      lostTimeout = setTimeout(() => {
        hint.hidden = false;
        timer?.pause();
      }, LOST_GRACE_MS);
    }
  });
  const newTimer = (limitSeconds: number | undefined, onExpire: () => void) => {
    timer = new PausableTimer(limitSeconds ? limitSeconds * 1000 : null, onExpire).start();
    if (!hint.hidden) timer.pause(); // the marker is already lost
    return timer;
  };

  // --- tiny helpers ---
  const clear = () => {
    panel.replaceChildren();
    bar.hidden = true;
  };
  const button = (label: string, cls?: string) => el('button', label, cls);
  const message = (text: string) => el('p', text, 'step-text');
  const waitFor = (label: string): Promise<void> =>
    new Promise((resolve) => {
      const b = button(label);
      b.onclick = () => resolve();
      panel.append(b);
    });

  /** Explains a wrong choice in text and (when recorded) voice, then waits for the worker. */
  async function consequence(option: Option, next: 'tryAgain' | 'continue') {
    clear();
    panel.append(message(loc(option.feedbackText, lang) || t(lang, 'failedMsg')));
    void clip(option.feedback);
    await waitFor(t(lang, next));
  }

  async function hazard(step: Step) {
    clear();
    panel.append(message(loc(step.text, lang)));
    void clip(step.audio);
    await waitFor(t(lang, 'continue'));
    engine.continue();
  }

  async function choice(step: Step & { type: 'choice' }) {
    for (;;) {
      clear();
      stage.show(scenario.id, step);
      panel.append(message(loc(step.text, lang)));
      void clip(step.audio);

      const picked = await new Promise<Option | 'expired'>((resolve) => {
        const tm = newTimer(step.timeLimit, () => resolve('expired'));
        let armed: string | null = null;
        const note = el('p', undefined, 'note');
        const cards = el('div', undefined, 'cards');
        for (const o of step.options) {
          const card = el('button', undefined, 'card');
          card.dataset.option = o.id;
          card.append(el('span', icon(o.icon), 'card-icon'), el('span', loc(o.label, lang), 'card-label'));
          card.onclick = () => {
            // One tap hears the option, a second tap chooses it: workers never pick by accident.
            if (armed === o.id) return resolve(o);
            armed = o.id;
            cards.querySelectorAll('.card').forEach((c) => c.classList.toggle('armed', c === card));
            note.textContent = t(lang, 'tapAgain');
            void clip(`${step.id}_opt_${o.id}`);
          };
          cards.append(card);
        }
        panel.append(cards, note);
        if (step.timeLimit) {
          bar.hidden = false;
          const tick = () => {
            if (!bar.isConnected || bar.hidden) return;
            barFill.style.width = `${(1 - tm.fraction) * 100}%`;
            requestAnimationFrame(tick);
          };
          tick();
        }
      });

      if (picked === 'expired') {
        engine.timeout();
        vibrate([100, 60, 100]);
        stage.effect('wrong');
        clear();
        panel.append(message(t(lang, 'timeUp')));
        await waitFor(t(lang, 'tryAgain'));
        continue;
      }

      const decisionMs = timer!.stop();
      const option = engine.choose(picked.id, decisionMs);
      if (option.critical) {
        stage.effect('critical');
        vibrate([250, 100, 250]);
        await consequence(option, 'continue');
        return;
      }
      if (option.correct) {
        stage.effect('success');
        return;
      }
      stage.effect('wrong');
      vibrate(150);
      await consequence(option, 'tryAgain');
    }
  }

  async function action(step: Step & { type: 'action' }) {
    const parts = gestures[step.gesture];
    if (!parts) throw new Error(`unknown gesture ${step.gesture}`);
    clear();
    stage.show(scenario.id, step);
    panel.append(message(loc(step.text, lang)));
    void clip(step.audio);

    const tm = newTimer(undefined, () => {});
    await new Promise<void>((resolve) => {
      let next = 0;
      const note = el('p', undefined, 'note');
      const buttons = el('div', undefined, 'cards grid'); // 2x2: keeps the scene visible above
      for (const p of shuffle(parts)) {
        const b = el('button', undefined, 'card');
        b.dataset.part = p.id;
        b.append(el('span', p.icon, 'card-icon'), el('span', loc(p.label, lang), 'card-label'));
        b.onclick = () => {
          if (p.id !== parts[next].id) {
            vibrate(150);
            note.textContent = t(lang, 'wrongPart');
            return;
          }
          note.textContent = '';
          b.disabled = true;
          b.classList.add('done');
          stage.effect({ part: p.id });
          void clip(`${step.id}_${p.id}`);
          if (++next === parts.length) resolve();
        };
        buttons.append(b);
      }
      panel.append(buttons, note);
    });
    engine.completeAction(tm.stop());
    stage.effect('success');
  }

  // --- main loop ---
  const engine = new ScenarioEngine(scenario);
  while (engine.status === 'running') {
    const step = engine.step!;
    stage.show(scenario.id, step);
    if (step.type === 'hazard') await hazard(step);
    else if (step.type === 'choice') await choice(step);
    else await action(step);
  }

  clear();
  timer?.stop();
  clearTimeout(lostTimeout);
  if (engine.status === 'passed') {
    // Let the worker watch the outcome (the fire going out) before the result screen takes over.
    panel.append(message(t(lang, 'passedTitle')));
    await new Promise((r) => setTimeout(r, PASS_MOMENT_MS));
  }
  const result = engine.result();
  const attempt = await saveAttempt({ workerId: worker.id, ...result });
  stage.destroy();
  if (!attempt.passed) void syncOutbox().catch(() => undefined); // a pass is synced by the result screen
  await renderResult(root, attempt, { onRetry: () => void runScenario(root, scenario, worker, makeStage) });
}

const CAMERA_TEXT = {
  insecure: 'camInsecure', unsupported: 'camUnsupported', denied: 'camDenied',
  missing: 'camMissing', busy: 'camBusy', failed: 'camFailed',
} as const;

/**
 * When AR could not start, say why (in the worker's language) instead of silently showing 3D, and offer
 * a retry where the worker can fix it (permission, a busy camera). The chip fades after a few seconds.
 */
function showStageStatus(screen: HTMLElement, stage: Stage, lang: Lang) {
  const info = stage.info;
  if (!info || info.mode === 'ar') return;
  const chip = el('div', undefined, 'stage-chip');
  chip.dataset.problem = info.problem ?? 'none';
  if (info.problem) chip.append(el('span', `📷 ${t(lang, CAMERA_TEXT[info.problem])}`));
  if (info.mode === 'viewer') chip.append(el('span', t(lang, 'dragToLook'), 'chip-hint'));
  if (info.problem && ['denied', 'busy', 'failed'].includes(info.problem)) {
    const retry = el('button', t(lang, 'camRetry'));
    retry.onclick = () => location.reload(); // restarts this scenario with a fresh camera request
    chip.append(retry);
  } else {
    setTimeout(() => chip.classList.add('fade'), 6000);
  }
  screen.append(chip);
}

/** /scenario?id=<scenario id> */
export async function renderScenarioRoute(
  root: HTMLElement,
  scenarios: Scenario[],
  makeStage: (scenario: Scenario) => Promise<Stage>,
) {
  const id = new URLSearchParams(location.search).get('id');
  const scenario = scenarios.find((s) => s.id === id);
  const worker = await db.worker.toCollection().first();
  if (!scenario || !worker) {
    location.replace('/');
    return;
  }
  await runScenario(root, scenario, worker, makeStage);
}
