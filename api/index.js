import { dispatch } from '../lib/api.js';
import { withDb } from '../lib/db.js';
import '../lib/seed.js'; // SEED_DEMO=1: fills a fresh database with demo data for the dashboard

// The only serverless function: vercel.json rewrites /api/<anything> here as ?path=<anything>.
// Routing is in lib/api.js.
export default withDb(dispatch);
