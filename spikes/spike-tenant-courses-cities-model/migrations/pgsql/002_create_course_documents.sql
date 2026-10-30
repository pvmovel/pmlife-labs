-- 002: a sede e os cursos da instituição em documentos JSON versionados (mesmo modelo do MySQL, ADR-012).
-- O documento fica como TEXT (não jsonb): o hash e o ETag valem para os bytes exatos e o SQL da aplicação é o mesmo
-- nos dois dialetos. O curso-modelo da plataforma continua no repositório e chega por course_links.
CREATE TABLE IF NOT EXISTS course_documents (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    kind VARCHAR(12) NOT NULL,
    slug VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, kind, slug),
    UNIQUE (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS course_document_versions (
    document_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    published_by INTEGER NOT NULL,
    published_at TIMESTAMP NOT NULL,
    PRIMARY KEY (document_id, version),
    FOREIGN KEY (document_id, tenant_id) REFERENCES course_documents (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_course_document_versions_tenant ON course_document_versions (tenant_id, document_id);

CREATE TABLE IF NOT EXISTS course_links (
    tenant_id INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    course_id VARCHAR(40) NOT NULL,
    adopted_version INTEGER NOT NULL,
    pending_version INTEGER NULL,
    pending_problems TEXT NULL,
    linked_at TIMESTAMP NOT NULL,
    PRIMARY KEY (tenant_id, course_id)
);
