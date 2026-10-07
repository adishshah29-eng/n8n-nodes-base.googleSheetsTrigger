import { el, fmtDate } from '../dom';
import { checkToken } from '../verify/token';

interface Status {
  valid: boolean;
  revoked: boolean;
  expired: boolean;
  scenarios: string[];
  expiresAt: string;
  worker: { name: string; employerId: string; photo: string | null };
}

async function fetchStatus(id: string): Promise<Status | 'not-found' | 'offline'> {
  try {
    const res = await fetch(`/api/certificates/${encodeURIComponent(id)}/status`, { cache: 'no-store' });
    if (res.status === 404) return 'not-found';
    if (!res.ok) return 'offline';
    return (await res.json()) as Status;
  } catch {
    return 'offline';
  }
}

/** Verify page at /v#<token>. The signature is checked on-device; the server only adds revocation + identity. */
export async function renderVerify(root: HTMLElement, token = decodeURIComponent(location.hash.slice(1))) {
  root.replaceChildren();
  const card = el('main', undefined, 'verify');
  root.append(card);
  const banner = (text: string, kind: 'ok' | 'bad' | 'warn') => card.append(el('h1', text, `banner ${kind}`));

  const check = await checkToken(token, import.meta.env.VITE_CERT_PUBLIC_KEY);
  if (!check.ok) {
    if (check.reason === 'no-key') {
      banner('Verifier not configured', 'warn');
    } else {
      banner(check.reason === 'bad-signature' ? 'Not valid — signature does not match' : 'Not valid — unreadable code', 'bad');
    }
    return;
  }

  const { cert } = check;
  const status = await fetchStatus(cert.c);
  if (status === 'not-found') return banner('Not valid — unknown certificate', 'bad');

  const revoked = status !== 'offline' && status.revoked;
  if (revoked) banner('Revoked', 'bad');
  else if (check.expired) banner('Expired', 'bad');
  else banner('Valid', 'ok');

  if (status !== 'offline') {
    const { worker } = status;
    if (worker.photo?.startsWith('data:image/')) {
      const img = el('img', undefined, 'photo');
      img.alt = `Photo of ${worker.name}`;
      img.src = worker.photo;
      card.append(img);
    }
    card.append(el('h2', worker.name), el('p', `Employer ID ${worker.employerId}`));
  } else {
    card.append(el('p', 'Signature checked on this device. Worker photo and revocation status need a connection.', 'note'));
  }

  const list = el('ul');
  for (const s of cert.sc) list.append(el('li', s));
  card.append(el('h3', 'Scenarios passed'), list, el('p', `Score ${cert.s}`), el('p', `Issued ${fmtDate(new Date(cert.i * 1000))}`), el('p', `Expires ${fmtDate(new Date(cert.e * 1000))}`));
}
