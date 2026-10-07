// Adds demo data to the SQLite database (24 workers, ~60 days of attempts, certificates, one revoked)
// so the admin dashboard has something to show. Needs ED25519_PRIVATE_KEY. --reset empties it first.
import { closeDb, getDb, run } from '../lib/db.js';
import { seedDemo } from '../lib/seed.js';

getDb();
if (process.argv.includes('--reset')) {
  for (const t of ['attempts', 'certificates', 'workers']) run(`DELETE FROM ${t}`);
  console.log('reset: tables emptied');
}
const r = seedDemo();
console.log(`seeded: ${r.workers} workers, ${r.attempts} attempts, ${r.certificates} certificates (${r.revoked} revoked)`);
closeDb();
