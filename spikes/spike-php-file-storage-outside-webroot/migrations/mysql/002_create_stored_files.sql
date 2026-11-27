-- 002: o registro de cada arquivo. O id público e o nome no disco são diferentes e gerados pelo servidor;
-- o nome original fica só para o download (limpo). Idempotente. Sem recursos exclusivos do MySQL 8.
CREATE TABLE IF NOT EXISTS stored_files (
    id CHAR(32) NOT NULL PRIMARY KEY,
    tenant_id INT UNSIGNED NOT NULL,
    course_id INT UNSIGNED NOT NULL,
    storage_key CHAR(32) NOT NULL,
    mime VARCHAR(40) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    sha256 CHAR(64) NOT NULL,
    original_name VARCHAR(160) NOT NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_stored_files_key (storage_key),
    KEY idx_stored_files_course (tenant_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
