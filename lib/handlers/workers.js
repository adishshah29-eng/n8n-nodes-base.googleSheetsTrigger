import { randomUUID } from 'node:crypto';
import { now, run } from '../db.js';
import { deviceToken } from '../sign.js';
import { validateProfile } from '../workers.js';

// POST /api/workers — enroll; returns the worker id and a signed device token.
export default function workers(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const { profile, error } = validateProfile(req.body);
  if (error) return res.status(400).json({ error });
  const id = randomUUID();
  const token = deviceToken(id);
  run('INSERT INTO workers (id, name, employer_id, site_id, lang, photo_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, profile.name, profile.employerId, profile.siteId, profile.lang, profile.photo, now());
  res.status(201).json({ id, deviceToken: token });
}
