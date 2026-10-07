// Creates or updates the SQLite database file (data/aotan.db, or DATABASE_PATH). The API also does this
// by itself on first use, so this is optional.
import { closeDb, dbPath, getDb } from '../lib/db.js';

getDb();
console.log(`database ready: ${dbPath()}`);
closeDb();
