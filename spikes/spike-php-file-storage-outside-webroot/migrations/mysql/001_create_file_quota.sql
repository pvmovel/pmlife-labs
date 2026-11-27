-- 001: a cota de cada instituição (o teto e o que já está usado), em bytes. Idempotente.
-- No PMLife, cada instituição tem o próprio banco (US44): a tabela terá uma linha só, e o tenant_id fica aqui para o
-- spike provar o isolamento num banco de teste único.
CREATE TABLE IF NOT EXISTS file_quota (
    tenant_id INT UNSIGNED NOT NULL PRIMARY KEY,
    quota_bytes BIGINT UNSIGNED NOT NULL,
    used_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
