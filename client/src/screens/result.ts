import { certificateCovering } from '../certificate/local';
import { el } from '../dom';
import { t, type Lang } from '../i18n';
import { resultKind, TEXT } from '../result/view';
import { db, type Attempt } from '../store/db';
import { syncOutbox } from '../sync/sync';

export interface ResultOptions {
  /** Replays the scenario. The scenario screen supplies it; without it no retry button is shown. */
  onRetry?: () => void;
  homeHref?: string;
}

async function workerLang(): Promise<Lang> {
  return (await db.worker.toCollection().first())?.lang ?? 'en';
}

/**
 * Shown right after a scenario ends. The score is local and instant; the certificate
 * is issued by the server, so a pass shows "Certificate after sync" until it arrives.
 */
export async function renderResult(root: HTMLElement, attempt: Attempt, opts: ResultOptions = {}) {
  const lang = await workerLang();
  const kind = resultKind(attempt);
  const text = TEXT[kind];

  root.replaceChildren();
  const card = el('main', undefined, 'result');
  card.append(el('h1', t(lang, text.title), `banner ${text.banner}`));
  card.append(el('p', t(lang, 'score'), 'score-label'), el('p', String(attempt.score), 'score'));
  card.append(el('p', t(lang, text.message)));
  root.append(card);

  const actions = el('div', undefined, 'actions');
  const status = el('div', undefined, 'cert-status');
  card.append(status, actions);

  if (opts.onRetry && kind !== 'passed') {
    const retry = el('button', t(lang, 'tryAgain'));
    retry.onclick = opts.onRetry;
    actions.append(retry);
  }
  const home = el('a', t(lang, 'home'), 'button secondary');
  home.href = opts.homeHref ?? '/';
  actions.append(home);

  if (kind !== 'passed') return;

  // Passed: show the certificate if the phone already has one for this scenario,
  // otherwise try to sync now (best effort) and fall back to "after sync".
  const showCertificate = (covered: boolean) => {
    status.replaceChildren();
    if (covered) {
      const link = el('a', t(lang, 'viewCert'), 'button');
      link.href = '/certificate';
      status.append(link);
    } else {
      status.append(el('p', t(lang, 'certPending'), 'pending'), el('p', t(lang, 'certPendingNote'), 'note'));
    }
  };

  if (await certificateCovering(attempt.scenarioId)) return showCertificate(true);
  showCertificate(false);

  const syncNow = async () => {
    status.replaceChildren(el('p', t(lang, 'syncing'), 'note'));
    await syncOutbox().catch(() => undefined);
    showCertificate(!!(await certificateCovering(attempt.scenarioId)));
  };
  if (navigator.onLine) await syncNow();
  // Airplane mode: stay on this screen, and the moment the phone is back online fetch the certificate.
  else window.addEventListener('online', () => void syncNow(), { once: true });
}

/** /result?id=<attempt id> — reopen a saved result. */
export async function renderResultRoute(root: HTMLElement) {
  const id = new URLSearchParams(location.search).get('id');
  const attempt = id ? await db.attempts.get(id) : undefined;
  if (!attempt) {
    root.replaceChildren(el('main', t(await workerLang(), 'notFound'), 'result'));
    return;
  }
  await renderResult(root, attempt);
}

/** Scenario → result handoff: result is already saved to the outbox by saveAttempt. */
export function resultHref(attemptId: string): string {
  return `/result?id=${encodeURIComponent(attemptId)}`;
}
