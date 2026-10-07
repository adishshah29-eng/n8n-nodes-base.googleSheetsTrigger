import '@fontsource/noto-sans-ol-chiki/ol-chiki-400.css';
import '@fontsource/noto-sans-ol-chiki/ol-chiki-700.css';
import './style.css';
import { initOffline } from './offline';
import { db, requestPersistentStorage } from './store/db';
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

  initOffline();

  if (location.pathname === '/admin') {
    const { renderAdmin } = await import('./admin');
    return renderAdmin(root);
  }

  if (location.pathname === '/result') {
    const { renderResultRoute } = await import('./screens/result');
    return renderResultRoute(root);
  }

  if (location.pathname === '/scenario') {
    const [{ renderScenarioRoute }, { scenarios }, { createStage }] = await Promise.all([
      import('./screens/scenario'),
      import('./content/scenarios'),
      import('./stage'),
    ]);
    return renderScenarioRoute(root, scenarios, createStage);
  }

  if (location.pathname === '/certificate') {
    const { renderCertificate } = await import('./screens/certificate');
    void syncOutbox(); // showing the QR: make sure the server knows this certificate and photo for the verifier
    await renderCertificate(root);
    window.addEventListener('online', () => void syncOutbox().then(() => renderCertificate(root)));
    return;
  }

  await requestPersistentStorage();
  void syncOutbox();
  window.addEventListener('online', () => void syncOutbox());

  // Home: enrolled workers see their scenarios, everyone else enrolls first.
  const show = async () => {
    const worker = await db.worker.toCollection().first();
    if (worker) {
      const { renderHome } = await import('./screens/home');
      await renderHome(root, worker);
    } else {
      const { renderEnroll } = await import('./screens/enroll');
      renderEnroll(root, () => void show());
    }
  };
  await show();
}

void boot();
