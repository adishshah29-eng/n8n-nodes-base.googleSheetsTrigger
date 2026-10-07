import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';

export const workers = Router();

const LANGS = ['sat', 'hi', 'en'];

// POST /api/workers — enroll; returns a device token (only its hash is stored)
workers.post('/', async (req, res) => {
  const { name, employerId, siteId, lang, photo } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof employerId !== 'string' || !employerId.trim()) {
    return res.status(400).json({ error: 'name and employerId are required' });
  }
  if (!LANGS.includes(lang)) return res.status(400).json({ error: `lang must be one of ${LANGS.join(', ')}` });

  const deviceToken = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(deviceToken).digest('hex');
  const { rows } = await pool.query(
    `INSERT INTO workers (name, employer_id, site_id, lang, photo_url, device_token_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name.trim(), employerId.trim(), siteId ?? null, lang, photo ?? null, hash],
  );
  res.status(201).json({ id: rows[0].id, deviceToken });
});
