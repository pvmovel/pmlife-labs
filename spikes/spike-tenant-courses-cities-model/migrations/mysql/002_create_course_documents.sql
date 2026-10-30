-- 002: a sede e os cursos da instituição em documentos JSON versionados (ADR-012). MySQL 5.7 (HostGator) e 8.x:
-- sem CHECK, sem CTE e sem window functions.
--
-- course_documents: um documento da instituição, pela chave de negócio (tenant, tipo, slug). Tipos:
--   headquarters  a sede (slug "sede", uma por instituição)
--   course        um curso da própria instituição (id público "<instituição>.<slug>"), inclusive uma cópia
--   overlay       a camada da instituição sobre um curso da plataforma vinculado (slug = id do curso da plataforma)
-- O curso-modelo da plataforma NÃO fica aqui: continua no repositório e chega por course_links.
CREATE TABLE IF NOT EXISTS course_documents (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT UNSIGNED NOT NULL,
    kind VARCHAR(12) NOT NULL,
    slug VARCHAR(40) NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_course_documents_key (tenant_id, kind, slug),
    UNIQUE KEY uq_course_documents_id_tenant (id, tenant_id),
    CONSTRAINT fk_course_documents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cada publicação é uma versão nova e imutável (nunca UPDATE). O documento fica como texto (não JSON): o hash e o
-- ETag valem para os bytes exatos, e o SQL é o mesmo nos dois dialetos. tenant_id repetido aqui deixa todo SELECT
-- filtrar pela instituição (e o RLS do PostgreSQL também).
CREATE TABLE IF NOT EXISTS course_document_versions (
    document_id INT UNSIGNED NOT NULL,
    tenant_id INT UNSIGNED NOT NULL,
    version INT UNSIGNED NOT NULL,
    content MEDIUMTEXT NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    published_by INT UNSIGNED NOT NULL,
    published_at DATETIME NOT NULL,
    PRIMARY KEY (document_id, version),
    KEY idx_course_document_versions_tenant (tenant_id, document_id),
    CONSTRAINT fk_course_document_versions_document FOREIGN KEY (document_id, tenant_id)
        REFERENCES course_documents (id, tenant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cursos da plataforma vinculados à instituição. adopted_version é a versão do curso-modelo que os alunos veem;
-- quando uma versão nova quebra a camada da instituição, ela fica em pending_version, com os problemas em
-- pending_problems, e adopted_version não muda (o aluno nunca recebe uma cidade inválida).
CREATE TABLE IF NOT EXISTS course_links (
    tenant_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    adopted_version INT UNSIGNED NOT NULL,
    pending_version INT UNSIGNED NULL,
    pending_problems TEXT NULL,
    linked_at DATETIME NOT NULL,
    PRIMARY KEY (tenant_id, course_id),
    CONSTRAINT fk_course_links_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
