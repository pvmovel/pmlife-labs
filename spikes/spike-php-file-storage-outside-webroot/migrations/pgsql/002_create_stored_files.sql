-- 002: o registro de cada arquivo (o mesmo do MySQL). Idempotente.
CREATE TABLE IF NOT EXISTS stored_files (
    id CHAR(32) NOT NULL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    storage_key CHAR(32) NOT NULL UNIQUE,
    mime VARCHAR(40) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    original_name VARCHAR(160) NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stored_files_course ON stored_files (tenant_id, course_id);
