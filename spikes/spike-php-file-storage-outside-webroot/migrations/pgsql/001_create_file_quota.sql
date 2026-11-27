-- 001: a cota de cada instituição (o teto e o que já está usado), em bytes. Idempotente.
CREATE TABLE IF NOT EXISTS file_quota (
    tenant_id INTEGER NOT NULL PRIMARY KEY,
    quota_bytes BIGINT NOT NULL CHECK (quota_bytes >= 0),
    used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (used_bytes >= 0)
);
