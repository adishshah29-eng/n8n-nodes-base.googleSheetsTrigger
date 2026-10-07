import './style.css';
import { requestPersistentStorage } from './store/db';
import { syncOutbox } from './sync/sync';

async function boot() {
  const root = document.getElementById('app')!;

  // A judge scanning a certificate QR lands here: verify only, no enrollment or sync.
  if (location.pathname === '/v') {
    const { renderVerify } = await import('./screens/verify');
    await renderVerify(root);
    window.addEventListener('hashchange', () => void renderVerify(root));
    return;
  }

  if (location.pathname === '/result') {
    const { renderResultRoute } = await import('./screens/result');
    await renderResultRoute(root);
    return;
  }

  if (location.pathname === '/certificate') {
    const { renderCertificate } = await import('./screens/certificate');
    await renderCertificate(root);
    window.addEventListener('online', () => void syncOutbox().then(() => renderCertificate(root)));
    return;
  }

  await requestPersistentStorage();
  void syncOutbox();
  window.addEventListener('online', () => void syncOutbox());
  root.textContent = 'Aotan';
}

void boot();
