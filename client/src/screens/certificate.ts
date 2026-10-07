import { qrSvg, verifyUrl } from '../certificate/qr';
import { latestCertificate } from '../certificate/local';
import { el, fmtDate } from '../dom';
import { syncOutbox } from '../sync/sync';

/** Shows the worker's certificate QR from local storage; works fully offline once synced. */
export async function renderCertificate(root: HTMLElement) {
  root.replaceChildren();
  const card = el('main', undefined, 'certificate');
  root.append(card);

  const found = await latestCertificate();
  if (!found) {
    card.append(el('h1', 'Certificate after sync', 'banner warn'));
    card.append(el('p', 'Your result is saved on this phone. Connect to the internet and your certificate will appear here.', 'note'));
    const btn = el('button', 'Sync now');
    btn.disabled = !navigator.onLine;
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Syncing…';
      await syncOutbox().catch(() => undefined);
      await renderCertificate(root);
    };
    card.append(btn);
    return;
  }

  const { cert, expired } = found;

  card.append(el('h1', expired ? 'Certificate expired' : 'Safety certificate', `banner ${expired ? 'bad' : 'ok'}`));
  const qr = el('div', undefined, 'qr');
  qr.append(qrSvg(verifyUrl(found.stored.token)));
  card.append(qr, el('p', 'Show this to the safety officer. Turn screen brightness up.', 'note'));

  const list = el('ul');
  for (const s of cert.sc) list.append(el('li', s));
  card.append(el('h3', 'Scenarios passed'), list, el('p', `Score ${cert.s}`), el('p', `Expires ${fmtDate(new Date(cert.e * 1000))}`));
}
