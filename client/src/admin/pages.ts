import { el } from '../dom';
import type { Scenario } from '../engine/types';
import { api, download } from './api';
import { percentBars } from './charts';
import type { AttemptDetail, AttemptRow, CertRow, Overview, WorkerRow } from './types';
import { badge, day, field, select, statusBadge, table, when } from './ui';

interface Site {
  id: number;
  name: string;
}

const SCENARIOS: [string, string][] = [['', 'All scenarios'], ['fire-panel', 'Electrical panel fire'], ['conveyor-loto', 'Conveyor lock-out / tag-out']];
const scenarioName = (id: string) => SCENARIOS.find(([v]) => v === id)?.[1] ?? id;
const stepOf = (s: Scenario | null | undefined, id: string) => s?.steps.find((x) => x.id === id);
const optionLabel = (s: Scenario | null | undefined, stepId: string, optionId: string) => {
  const step = stepOf(s, stepId);
  const o = step?.type === 'choice' ? step.options.find((x) => x.id === optionId) : undefined;
  return o?.label?.en ?? (optionId === 'timeout' ? 'Ran out of time' : optionId);
};

type Filters = { site: string; scenario: string; from: string; to: string };
const qs = (f: Record<string, string>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Site / scenario / date filter bar; calls `onChange` with the current values. */
async function filterBar(initial: Filters, onChange: (f: Filters) => void) {
  const sites: Site[] = await fetch('/api/sites').then((r) => r.json()).then((j: { sites: Site[] }) => j.sites).catch(() => []);
  const site = select([['', 'All sites'], ...sites.map((s) => [String(s.id), s.name] as [string, string])], initial.site);
  const scenario = select(SCENARIOS, initial.scenario);
  const from = el('input');
  from.type = 'date';
  from.value = initial.from;
  const to = el('input');
  to.type = 'date';
  to.value = initial.to;
  const bar = el('div', undefined, 'filters');
  bar.append(field('Site', site), field('Scenario', scenario), field('From', from), field('To', to));
  const fire = () => onChange({ site: site.value, scenario: scenario.value, from: from.value, to: to.value });
  [site, scenario, from, to].forEach((x) => x.addEventListener('change', fire));
  return bar;
}

let filters: Filters = { site: '', scenario: '', from: '', to: '' };

export async function overviewPage(host: HTMLElement) {
  host.replaceChildren(el('h2', 'Overview'));
  const body = el('div');
  const load = async () => {
    const o = await api<Overview>(`overview${qs(filters)}`);
    body.replaceChildren();

    const stats = el('div', undefined, 'stats');
    const stat = (label: string, value: string | number) => {
      const c = el('div', undefined, 'stat');
      c.append(el('div', String(value), 'stat-n'), el('div', label, 'stat-l'));
      return c;
    };
    stats.append(
      stat('Workers enrolled', o.totals.workers),
      stat('Valid certificates', o.totals.valid_certificates),
      stat('Attempts counted', o.scenarios.reduce((n, s) => n + s.attempts, 0)),
      stat('Flagged attempts', o.totals.flaggedAttempts),
    );
    body.append(stats);

    body.append(el('h3', 'Pass rate by scenario'));
    if (o.scenarios.length === 0) body.append(el('p', 'No attempts match these filters yet.', 'note'));
    else {
      const box = el('div', undefined, 'chart');
      box.style.height = `${60 + o.scenarios.length * 56}px`;
      const canvas = el('canvas');
      box.append(canvas);
      body.append(box);
      percentBars(canvas, o.scenarios.map((s) => `${scenarioName(s.scenario_id)} (${s.attempts})`), o.scenarios.map((s) => s.passRate), '#16a34a');
    }

    body.append(el('h3', 'Most common wrong first choice'));
    body.append(el('p', 'Share of workers who reached the step and picked this wrong option first — what to fix in toolbox talks.', 'note'));
    if (o.wrongFirstChoices.length === 0) body.append(el('p', 'No wrong first choices recorded.', 'note'));
    else {
      const box = el('div', undefined, 'chart');
      box.style.height = `${60 + o.wrongFirstChoices.length * 40}px`;
      const canvas = el('canvas');
      box.append(canvas);
      body.append(box);
      const w = o.wrongFirstChoices;
      percentBars(
        canvas,
        w.map((c) => `${optionLabel(o.scenarioDefs[c.scenarioId], c.stepId, c.optionId)} · ${scenarioName(c.scenarioId)} (${c.count}/${c.reached})`),
        w.map((c) => c.share),
        '#dc2626',
      );
    }
  };
  host.append(await filterBar(filters, (f) => ((filters = f), void load())), body);
  await load();
}

export async function workersPage(host: HTMLElement) {
  host.replaceChildren(el('h2', 'Workers'));
  const { workers } = await api<{ workers: WorkerRow[] }>('workers');
  host.append(
    table(
      ['Name', 'Employer ID', 'Site', 'Language', 'Last training', 'Attempts', 'Certificate'],
      workers.map((w) => [
        w.name, w.employer_id, w.site ?? '—', w.lang, when(w.last_training), String(w.attempts),
        (() => {
          const s = el('span');
          s.append(statusBadge(w.certificate.status));
          if (w.certificate.expiresAt) s.append(document.createTextNode(` until ${day(w.certificate.expiresAt)}`));
          return s;
        })(),
      ]),
    ),
  );
}

const resultBadge = (a: AttemptRow) =>
  a.flag ? badge('Flagged', 'warn') : a.critical_fail ? badge('Critical', 'bad') : a.passed ? badge('Passed', 'ok') : badge('Failed', 'mute');

export async function attemptsPage(host: HTMLElement) {
  host.replaceChildren(el('h2', 'Attempts'));
  const body = el('div');
  const load = async () => {
    const { attempts } = await api<{ attempts: AttemptRow[] }>(`attempts${qs(filters)}`);
    body.replaceChildren(
      table(
        ['When', 'Worker', 'Site', 'Scenario', 'Score', 'Result', 'Time'],
        attempts.map((a) => [when(a.received_at), `${a.name} (${a.employer_id})`, a.site ?? '—', scenarioName(a.scenario_id), String(a.score), resultBadge(a), `${Math.round(a.duration_ms / 1000)}s`]),
        (i) => (location.hash = `#attempt/${attempts[i].id}`),
      ),
    );
  };
  host.append(await filterBar(filters, (f) => ((filters = f), void load())), body);
  await load();
}

export async function attemptDetailPage(host: HTMLElement, id: string) {
  host.replaceChildren();
  const back = el('a', '← Attempts', 'back');
  back.href = '#attempts';
  const { attempt: a, scenario } = await api<AttemptDetail>(`attempts/${encodeURIComponent(id)}`);
  const head = el('div', undefined, 'detail-head');
  if (a.photo_url?.startsWith('data:image/')) {
    const img = el('img', undefined, 'avatar');
    img.src = a.photo_url;
    img.alt = `Photo of ${a.name}`;
    head.append(img);
  }
  const info = el('div');
  info.append(el('h2', a.name), el('p', `Employer ID ${a.employer_id} · ${a.site ?? 'no site'}`, 'note'), el('p', `${scenarioName(a.scenario_id)} · ${when(a.received_at)} · ${Math.round(a.duration_ms / 1000)}s total · score ${a.score}`));
  const r = el('p');
  r.append(resultBadge(a));
  if (a.flag) r.append(document.createTextNode(` ${a.flag}`));
  info.append(r);
  head.append(info);

  const rows = a.steps.map((s) => {
    const step = stepOf(scenario, s.stepId);
    const cell = el('span');
    for (const c of s.choices ?? (s.optionId ? [s.optionId] : [])) {
      const opt = step?.type === 'choice' ? step.options.find((o) => o.id === c) : undefined;
      cell.append(badge(optionLabel(scenario, s.stepId, c), opt?.correct ? 'ok' : opt?.critical ? 'bad' : 'warn'), document.createTextNode(' '));
    }
    return [step?.text?.en ?? s.stepId, cell, String(s.tries), `${(s.decisionMs / 1000).toFixed(1)}s`];
  });
  host.append(back, head, el('h3', 'Every step'), table(['Step', 'Choices, in order', 'Tries', 'Decision time'], rows));
}

export async function certificatesPage(host: HTMLElement) {
  host.replaceChildren(el('h2', 'Certificates'));
  const search = el('input');
  search.type = 'search';
  search.placeholder = 'Search name, employer ID or certificate ID';
  const exportBtn = el('button', 'Export attempts (CSV)', 'secondary');
  exportBtn.onclick = () => void download(`export.csv${qs(filters)}`, 'aotan-attempts.csv');
  const bar = el('div', undefined, 'filters');
  bar.append(field('Search', search), exportBtn);
  const body = el('div');
  const load = async () => {
    const { certificates } = await api<{ certificates: CertRow[] }>(`certificates${qs({ q: search.value })}`);
    body.replaceChildren(
      table(
        ['Worker', 'Scenarios', 'Score', 'Issued', 'Expires', 'Status', ''],
        certificates.map((c) => {
          const act = el('span');
          if (c.status === 'valid') {
            const b = el('button', 'Revoke', 'danger');
            b.onclick = async () => {
              if (!confirm(`Revoke the certificate for ${c.name}? Anyone scanning it will see "Revoked".`)) return;
              await api(`certificates/${c.id}/revoke`, { method: 'POST' });
              await load();
            };
            act.append(b);
          }
          return [`${c.name} (${c.employer_id})`, c.scenarios.map(scenarioName).join(', '), String(c.score), day(c.issued_at), day(c.expires_at), statusBadge(c.status), act];
        }),
      ),
    );
  };
  let t: ReturnType<typeof setTimeout>;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => void load(), 250);
  });
  host.append(bar, body);
  await load();
}

