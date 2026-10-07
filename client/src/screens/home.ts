import { unlockAudio } from '../audio/audio';
import { latestCertificate } from '../certificate/local';
import { scenarios } from '../content/scenarios';
import { el } from '../dom';
import { fill, t } from '../i18n';
import { isOfflineReady, onOfflineReady } from '../offline';
import { db, type WorkerProfile } from '../store/db';

/** Home: install status, scenarios (passed ones are ticked), results waiting to sync, certificate link. */
export async function renderHome(root: HTMLElement, worker: WorkerProfile) {
  const lang = worker.lang;
  root.replaceChildren();
  const card = el('main', undefined, 'home');
  card.append(el('h1', `${t(lang, 'hello')}, ${worker.name}`));

  const badge = el('p', undefined, 'offline-badge');
  const refreshBadge = async () => {
    const ready = await isOfflineReady();
    badge.className = `offline-badge ${ready ? 'ready' : 'preparing'}`;
    badge.textContent = t(lang, ready ? 'readyOffline' : navigator.onLine ? 'preparingOffline' : 'notReadyOffline');
    return ready;
  };
  // The install can finish before this screen exists (enrollment takes a while), so an event
  // alone can be missed. Re-check every second until ready, and on the usual signals too.
  if (!(await refreshBadge())) {
    const timer = setInterval(() => void refreshBadge().then((r) => r && clearInterval(timer)), 1000);
    setTimeout(() => clearInterval(timer), 120_000);
  }
  onOfflineReady(() => void refreshBadge());
  window.addEventListener('online', () => void refreshBadge());
  card.append(badge);

  const pending = await db.outbox.count();
  if (pending > 0) card.append(el('p', `${pending} ${t(lang, 'waitingToSync')}`, 'note'));

  card.append(el('h2', t(lang, 'scenarios')));
  const passed = new Set((await db.attempts.filter((a) => a.passed).toArray()).map((a) => a.scenarioId));
  for (const s of scenarios) {
    const row = el('div', undefined, 'scenario');
    row.append(el('span', s.title?.[lang === 'en' ? 'en' : 'hi'] ?? s.id, 'scenario-title'));
    if (passed.has(s.id)) row.append(el('span', `✓ ${t(lang, 'done')}`, 'tick'));
    const start = el('a', t(lang, 'start'), 'button');
    start.href = `/scenario?id=${encodeURIComponent(s.id)}`;
    start.onclick = () => unlockAudio(); // the first tap unlocks sound for the whole session
    row.append(start);
    card.append(row);
  }

  if (await latestCertificate()) {
    const cert = el('a', t(lang, 'myCertificate'), 'button secondary');
    cert.href = '/certificate';
    card.append(cert);
  }
  root.append(card);
}
