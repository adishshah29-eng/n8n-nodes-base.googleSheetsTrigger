-- SQLite schema. Timestamps are ISO-8601 UTC strings (they sort correctly as text); booleans are 0/1;
-- steps and certificate scenario lists are JSON text. No foreign keys: on a serverless host the database
-- can be reset, and the phone may restore a worker after their attempts (see lib/handlers/attempts.js).

CREATE TABLE sites (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  district  TEXT
);

CREATE TABLE workers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  employer_id  TEXT NOT NULL,
  site_id      INTEGER,
  lang         TEXT NOT NULL CHECK (lang IN ('sat', 'hi', 'en')),
  photo_url    TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE attempts (
  id             TEXT PRIMARY KEY,         -- client UUID; the server upserts on it
  worker_id      TEXT NOT NULL,
  scenario_id    TEXT NOT NULL,
  score          INTEGER NOT NULL,
  passed         INTEGER NOT NULL,
  critical_fail  INTEGER NOT NULL DEFAULT 0,
  steps          TEXT NOT NULL,            -- JSON
  duration_ms    INTEGER NOT NULL,
  device_time    TEXT NOT NULL,
  received_at    TEXT NOT NULL,
  flag           TEXT                      -- set when the server judged a pass implausible
);
CREATE INDEX attempts_worker_idx ON attempts (worker_id);
CREATE INDEX attempts_scenario_idx ON attempts (scenario_id);

CREATE TABLE certificates (
  id          TEXT PRIMARY KEY,
  worker_id   TEXT NOT NULL,
  scenarios   TEXT NOT NULL,               -- JSON array, sorted
  score       INTEGER NOT NULL,
  issued_at   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  payload     TEXT NOT NULL,               -- exact signed payload (base64url); token = payload + '.' + signature
  signature   TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX certificates_worker_idx ON certificates (worker_id);
