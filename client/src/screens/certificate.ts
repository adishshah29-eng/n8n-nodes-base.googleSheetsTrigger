import { qrSvg, verifyUrl } from '../certificate/qr';
import { db, type StoredCertificate } from '../store/db';
import { syncOutbox } from '../sync/sync';
import { checkToken } from '../verify/token';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Newest verified certificate on this phone, by issue date inside the signed payload. */
async function latest(): Promise<{ stored: StoredCertificate; issued: number } | null> {
  let best: { stored: StoredCertificate; issued: number } | null = null;
  for (const stored of await db.certificates.toArray()) {
    const r = await checkToken(stored.token, import.meta.env.VITE_CERT_PUBLIC_KEY);
    // A token that fails to verify is never shown as a certificate
    if (r.ok && (!best || r.cert.i > best.issued)) best = { stored, issued: r.cert.i };
  }
  return best;
}

/** Shows the worker's certificate QR from local storage; works fully offline once synced. */
export async function renderCertificate(root: HTMLElement) {
  root.replaceChildren();
  const card = el('main', undefined, 'certificate');
  root.append(card);

  const found = await latest();
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

  const check = await checkToken(found.stored.token, import.meta.env.VITE_CERT_PUBLIC_KEY);
  if (!check.ok) return; // unreachable: latest() only returns verified tokens
  const { cert, expired } = check;

  card.append(el('h1', expired ? 'Certificate expired' : 'Safety certificate', `banner ${expired ? 'bad' : 'ok'}`));
  const qr = el('div', undefined, 'qr');
  qr.append(qrSvg(verifyUrl(found.stored.token)));
  card.append(qr, el('p', 'Show this to the safety officer. Turn screen brightness up.', 'note'));

  const list = el('ul');
  for (const s of cert.sc) list.append(el('li', s));
  card.append(el('h3', 'Scenarios passed'), list, el('p', `Score ${cert.s}`), el('p', `Expires ${fmtDate(new Date(cert.e * 1000))}`));
}
