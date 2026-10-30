-- 003 (só PostgreSQL): Row Level Security nas três tabelas com tenant_id, a segunda barreira do caminho de escala
-- (ADR-006/007). A aplicação informa a instituição da sessão em app.tenant_id (set_config) e o banco filtra sozinho,
-- mesmo num SELECT sem WHERE. FORCE vale também para o dono da tabela; superusuários continuam ignorando o RLS (a
-- aplicação usa um papel comum). No MySQL 5.7 não há RLS: lá o filtro por tenant_id é da aplicação (Repository).
ALTER TABLE course_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON course_documents;
CREATE POLICY tenant_isolation ON course_documents
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

ALTER TABLE course_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_document_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON course_document_versions;
CREATE POLICY tenant_isolation ON course_document_versions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

ALTER TABLE course_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON course_links;
CREATE POLICY tenant_isolation ON course_links
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
