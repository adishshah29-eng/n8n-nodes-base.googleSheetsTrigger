import { handleAdmin } from '../lib/admin/router.js';

// All admin endpoints live behind this one function (routing is in lib/admin/router.js).
// vercel.json rewrites /api/admin/<anything> to /api/admin?path=<anything>: Vercel's own catch-all
// files only match a single path segment, which would break /api/admin/attempts/<id> etc.
export default handleAdmin;
