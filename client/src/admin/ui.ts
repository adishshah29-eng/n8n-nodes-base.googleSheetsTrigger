import { el } from '../dom';

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

export function badge(text: string, kind: 'ok' | 'bad' | 'warn' | 'mute') {
  return el('span', text, `badge ${kind}`);
}

export const statusBadge = (s: string) =>
  badge(s, s === 'valid' ? 'ok' : s === 'none' ? 'mute' : s === 'expired' ? 'warn' : 'bad');

/** A table built from DOM nodes only; cell strings can never inject markup. */
export function table(head: string[], rows: (string | Node)[][], onRow?: (i: number) => void) {
  const t = el('table', undefined, 'tbl');
  const thead = el('thead');
  const hr = el('tr');
  head.forEach((h) => hr.append(el('th', h)));
  thead.append(hr);
  const tbody = el('tbody');
  rows.forEach((r, i) => {
    const tr = el('tr');
    r.forEach((c) => {
      const td = el('td');
      td.append(typeof c === 'string' ? document.createTextNode(c) : c);
      tr.append(td);
    });
    if (onRow) {
      tr.classList.add('clickable');
      tr.onclick = () => onRow(i);
    }
    tbody.append(tr);
  });
  t.append(thead, tbody);
  const wrap = el('div', undefined, 'tbl-wrap');
  if (rows.length === 0) wrap.append(el('p', 'Nothing to show yet.', 'note'));
  else wrap.append(t);
  return wrap;
}

export function field(label: string, input: HTMLElement) {
  const l = el('label', undefined, 'afield');
  l.append(el('span', label), input);
  return l;
}

export function select(options: [string, string][], value = '') {
  const s = el('select');
  for (const [v, text] of options) s.append(new Option(text, v, false, v === value));
  return s;
}
