-- 001: o banco de hoje, no mínimo que o spike usa. As contas (US30): instituições com o código de convite, pessoas
-- (uma conta por e-mail) e o vínculo com o papel na instituição. A matrícula (US44): o tutor de um curso vê só os
-- alunos matriculados nele.
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(40) NOT NULL,
    name VARCHAR(80) NOT NULL,
    invite_code VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_tenants_slug UNIQUE (slug),
    CONSTRAINT uq_tenants_invite UNIQUE (invite_code)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    display_name VARCHAR(40) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    terms_version VARCHAR(20) NOT NULL,
    terms_accepted_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, tenant_id),
    CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships (tenant_id);

CREATE TABLE IF NOT EXISTS enrollments (
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    status VARCHAR(10) NOT NULL,
    requested_at TIMESTAMP NOT NULL,
    PRIMARY KEY (tenant_id, user_id, course_id),
    CONSTRAINT fk_enrollments_membership FOREIGN KEY (user_id, tenant_id) REFERENCES memberships (user_id, tenant_id) ON DELETE CASCADE
);
