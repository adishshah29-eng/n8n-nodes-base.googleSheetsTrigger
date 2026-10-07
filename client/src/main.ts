import { requestPersistentStorage } from './store/db';
import { syncOutbox } from './sync/sync';

async function boot() {
  await requestPersistentStorage();
  void syncOutbox();
  window.addEventListener('online', () => void syncOutbox());
  document.getElementById('app')!.textContent = 'Aotan';
}

void boot();
