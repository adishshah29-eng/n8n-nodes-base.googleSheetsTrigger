-- attempts the server judged implausible are kept but never earn a certificate
ALTER TABLE attempts ADD COLUMN flag text;
-- exact signed payload (base64url); token = payload + '.' + signature
ALTER TABLE certificates ADD COLUMN payload text;
CREATE INDEX certificates_worker_idx ON certificates (worker_id);
