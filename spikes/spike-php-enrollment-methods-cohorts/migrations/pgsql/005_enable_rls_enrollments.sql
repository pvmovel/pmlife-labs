-- 005 (só PostgreSQL): Row Level Security nas três tabelas da matrícula, a segunda barreira do caminho de escala. A
-- aplicação informa a instituição da sessão em app.tenant_id (set_config) e o banco filtra sozinho.
ALTER TABLE course_enrollment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollment_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON course_enrollment_rules;
CREATE POLICY tenant_isolation ON course_enrollment_rules
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cohorts;
CREATE POLICY tenant_isolation ON cohorts
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON enrollments;
CREATE POLICY tenant_isolation ON enrollments
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
