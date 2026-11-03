-- 003 (só PostgreSQL, o caminho de escala do ADR-006): dois papéis de banco e o Row Level Security.
--   app_tenant   a conexão de todo pedido com escopo de instituição: vê só a instituição de app.tenant_id;
--   app_platform a conexão do repositório da plataforma (master da plataforma, auditado): vê todas.
-- Uma variável de sessão nunca libera tudo: alcançar todas as instituições exige a outra conexão (outro usuário do
-- banco, membro de app_platform). Os usuários com senha (LOGIN) são criados no servidor, fora da migration.
-- A auditoria só aceita INSERT e SELECT dos dois papéis: ninguém da aplicação altera nem apaga uma linha.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN CREATE ROLE app_tenant NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform') THEN CREATE ROLE app_platform NOLOGIN; END IF; END $$;

GRANT SELECT ON tenants, users, platform_admins, enrollments TO app_tenant;
GRANT SELECT, UPDATE ON memberships TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON course_staff TO app_tenant;
GRANT SELECT, INSERT ON admin_audit TO app_tenant;

GRANT SELECT, INSERT, UPDATE ON tenants, users, memberships TO app_platform;
GRANT SELECT, INSERT, DELETE ON platform_admins TO app_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON course_staff TO app_platform;
GRANT SELECT ON enrollments TO app_platform;
GRANT SELECT, INSERT ON admin_audit TO app_platform;
GRANT USAGE ON SEQUENCE tenants_id_seq, users_id_seq TO app_platform;
GRANT USAGE ON SEQUENCE admin_audit_id_seq TO app_tenant, app_platform;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants TO app_tenant
    USING (id = NULLIF(current_setting('app.tenant_id', true), '')::int);
DROP POLICY IF EXISTS platform_all ON tenants;
CREATE POLICY platform_all ON tenants TO app_platform USING (true) WITH CHECK (true);

-- Uma pessoa aparece para a instituição só se tiver vínculo com ela (a tabela de contas não tem tenant_id).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users TO app_tenant
    USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int));
DROP POLICY IF EXISTS platform_all ON users;
CREATE POLICY platform_all ON users TO app_platform USING (true) WITH CHECK (true);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON memberships;
CREATE POLICY tenant_isolation ON memberships TO app_tenant
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
DROP POLICY IF EXISTS platform_all ON memberships;
CREATE POLICY platform_all ON memberships TO app_platform USING (true) WITH CHECK (true);

ALTER TABLE course_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON course_staff;
CREATE POLICY tenant_isolation ON course_staff TO app_tenant
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
DROP POLICY IF EXISTS platform_all ON course_staff;
CREATE POLICY platform_all ON course_staff TO app_platform USING (true) WITH CHECK (true);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON enrollments;
CREATE POLICY tenant_isolation ON enrollments TO app_tenant
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
DROP POLICY IF EXISTS platform_all ON enrollments;
CREATE POLICY platform_all ON enrollments TO app_platform USING (true);

ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON admin_audit;
CREATE POLICY tenant_isolation ON admin_audit TO app_tenant
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
DROP POLICY IF EXISTS platform_all ON admin_audit;
CREATE POLICY platform_all ON admin_audit TO app_platform USING (true) WITH CHECK (true);
