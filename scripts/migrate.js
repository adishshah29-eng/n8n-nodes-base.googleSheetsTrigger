// Applies pending migrations. Deployed functions also do this by themselves on first use (lib/db.js),
// so running this by hand is optional; it is handy for a fresh local database.
import { migrate, pool } from '../lib/db.js';

const applied = await migrate();
console.log(applied.length ? applied.map((n) => `applied ${n}`).join('\n') : 'database is up to date');
await pool.end();
