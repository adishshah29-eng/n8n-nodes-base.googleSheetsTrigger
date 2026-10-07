import { get, now, run } from './db.js';

const LANGS = ['sat', 'hi', 'en'];
// The enrollment photo is what stops one person training for another, so it is required.
// The client sends a downscaled JPEG; this bound keeps the row (and the verify page) small.
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_PHOTO_CHARS = 400_000;

/** Validates an enrollment profile. Returns { profile } or { error }. */
export function validateProfile(body) {
  const { name, employerId, siteId, lang, photo } = body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof employerId !== 'string' || !employerId.trim()) return { error: 'name and employerId are required' };
  if (!LANGS.includes(lang)) return { error: `lang must be one of ${LANGS.join(', ')}` };
  if (typeof photo !== 'string' || photo.length > MAX_PHOTO_CHARS || !PHOTO.test(photo)) return { error: 'photo must be a JPEG, PNG or WebP data URL under 400 KB' };
  if (siteId != null && !Number.isInteger(siteId)) return { error: 'siteId must be an integer' };
  return { profile: { name: name.trim(), employerId: employerId.trim(), siteId: siteId ?? null, lang, photo } };
}

/** Inserts the worker if this server does not know them (after a reset). Returns true if it was missing. */
export function restoreWorker(id, profile) {
  if (get('SELECT 1 AS x FROM workers WHERE id = ?', id)) return false;
  run('INSERT INTO workers (id, name, employer_id, site_id, lang, photo_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, profile.name, profile.employerId, profile.siteId, profile.lang, profile.photo, now());
  return true;
}
