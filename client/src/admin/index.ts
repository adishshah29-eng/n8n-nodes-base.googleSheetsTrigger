import { el } from '../dom';
import { AuthError, getToken, login, logout } from './api';
import { attemptDetailPage, attemptsPage, certificatesPage, overviewPage, workersPage } from './pages';

const TABS: [string, string][] = [['overview', 'Overview'], ['workers', 'Workers'], ['attempts', 'Attempts'], ['certificates', 'Certificates']];

/** /admin — safety officer dashboard. Hash routes: #overview #workers #attempts #attempt/<id> #certificates */
export function renderAdmin(root: HTMLElement) {
  document.title = 'Aotan admin';
  if (!getToken()) return renderLogin(root);

  root.replaceChildren();
  const shell = el('div', undefined, 'admin');
  const nav = el('nav');
  const content = el('main');
  shell.append(nav, content);
  root.append(shell);

  const route = async () => {
    const [page, arg] = (location.hash.slice(1) || 'overview').split('/');
    nav.replaceChildren(el('strong', 'Aotan'));
    for (const [id, label] of TABS) {
      const a = el('a', label);
      a.href = `#${id}`;
      if (id === page || (page === 'attempt' && id === 'attempts')) a.className = 'active';
      nav.append(a);
    }
    const out = el('button', 'Log out', 'secondary');
    out.onclick = () => (logout(), renderAdmin(root));
    nav.append(out);

    content.replaceChildren(el('p', 'Loading…', 'note'));
    try {
      if (page === 'workers') await workersPage(content);
      else if (page === 'attempts') await attemptsPage(content);
      else if (page === 'attempt' && arg) await attemptDetailPage(content, arg);
      else if (page === 'certificates') await certificatesPage(content);
      else await overviewPage(content);
    } catch (e) {
      if (e instanceof AuthError) return renderAdmin(root); // session expired -> login
      content.replaceChildren(el('p', `Could not load this page (${(e as Error).message}).`, 'note'));
    }
  };
  window.addEventListener('hashchange', route);
  void route();
}

function renderLogin(root: HTMLElement) {
  root.replaceChildren();
  const form = el('form', undefined, 'login');
  const pw = el('input');
  pw.type = 'password';
  pw.placeholder = 'Admin password';
  pw.autocomplete = 'current-password';
  const msg = el('p', undefined, 'note');
  const go = el('button', 'Log in');
  go.type = 'submit';
  form.append(el('h1', 'Aotan admin'), pw, msg, go);
  form.onsubmit = async (e) => {
    e.preventDefault();
    go.disabled = true;
    msg.textContent = '';
    try {
      if (await login(pw.value)) return renderAdmin(root);
      msg.textContent = 'Wrong password.';
    } catch {
      msg.textContent = 'Could not reach the server.';
    }
    go.disabled = false;
  };
  const wrap = el('main', undefined, 'admin-login');
  wrap.append(form);
  root.append(wrap);
}
