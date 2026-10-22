-- 001: clientes (tenants), contas e vínculos (mesmo modelo do MySQL).
-- LGPD: dados mínimos. Nada de data de nascimento, CPF ou telefone; o consentimento dos responsáveis por alunos
-- menores é coletado pela instituição (controladora), e aqui só fica o aceite dos termos (versão e data).
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    invite_code VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    display_name VARCHAR(40) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    terms_version VARCHAR(20) NOT NULL,
    terms_accepted_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_id INT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'tenant_admin')),
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships (tenant_id);
