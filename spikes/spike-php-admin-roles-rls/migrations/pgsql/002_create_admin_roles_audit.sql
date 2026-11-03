-- 002 (US36): o admin, no dialeto do PostgreSQL (o mesmo desenho da versão MySQL). Idempotente.
--
-- Desativar não apaga nada: a instituição e o vínculo ganham "active", e o progresso e as matrículas ficam guardados.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- A conta criada pelo master da plataforma aceita os termos no primeiro acesso.
ALTER TABLE users ALTER COLUMN terms_version DROP NOT NULL;
ALTER TABLE users ALTER COLUMN terms_accepted_at DROP NOT NULL;

-- Master da plataforma: um papel FORA do escopo de instituição. created_by NULL = o primeiro, criado pelo SQL de ops/.
CREATE TABLE IF NOT EXISTS platform_admins (
    user_id INTEGER NOT NULL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    created_by INTEGER NULL,
    CONSTRAINT fk_platform_admins_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_platform_admins_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

-- Papel num curso (ADR-012): 'author' ou 'tutor'. A FK para o vínculo impede designar quem não é da instituição.
CREATE TABLE IF NOT EXISTS course_staff (
    tenant_id INTEGER NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    user_id INTEGER NOT NULL,
    role VARCHAR(10) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (tenant_id, course_id, user_id),
    CONSTRAINT fk_course_staff_membership FOREIGN KEY (user_id, tenant_id) REFERENCES memberships (user_id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_course_staff_user ON course_staff (tenant_id, user_id);

-- Auditoria: só INSERT e SELECT (no PostgreSQL, imposto pelos privilégios da 003). tenant_id NULL = ação da plataforma.
CREATE TABLE IF NOT EXISTS admin_audit (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    actor_user_id INTEGER NULL,
    actor_scope VARCHAR(10) NOT NULL,
    tenant_id INTEGER NULL,
    action VARCHAR(40) NOT NULL,
    target VARCHAR(160) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_tenant ON admin_audit (tenant_id, id);
