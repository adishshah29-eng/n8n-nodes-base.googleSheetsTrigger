CREATE TABLE sites (
  id        serial PRIMARY KEY,
  name      text NOT NULL,
  district  text
);

CREATE TABLE workers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  employer_id        text NOT NULL,
  site_id            integer REFERENCES sites(id),
  lang               text NOT NULL CHECK (lang IN ('sat', 'hi', 'en')),
  photo_url          text,
  device_token_hash  text NOT NULL UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attempts (
  id             uuid PRIMARY KEY, -- client UUID; server upserts on it
  worker_id      uuid NOT NULL REFERENCES workers(id),
  scenario_id    text NOT NULL,
  score          integer NOT NULL,
  passed         boolean NOT NULL,
  critical_fail  boolean NOT NULL DEFAULT false,
  steps          jsonb NOT NULL,
  duration_ms    integer NOT NULL,
  device_time    timestamptz NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempts_worker_idx ON attempts (worker_id);
CREATE INDEX attempts_scenario_idx ON attempts (scenario_id);

CREATE TABLE certificates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   uuid NOT NULL REFERENCES workers(id),
  scenarios   text[] NOT NULL,
  score       integer NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  signature   text NOT NULL,
  revoked_at  timestamptz
);
