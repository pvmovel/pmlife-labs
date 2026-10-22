-- 001: clientes (tenants), contas e vínculos. Compatível com MySQL 5.7 (HostGator) e 8.x: sem CHECK nem CTE.
-- LGPD: dados mínimos. Nada de data de nascimento, CPF ou telefone; o consentimento dos responsáveis por alunos
-- menores é coletado pela instituição (controladora), e aqui só fica o aceite dos termos (versão e data).
CREATE TABLE IF NOT EXISTS tenants (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(40) NOT NULL,
    name VARCHAR(80) NOT NULL,
    invite_code VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_tenants_slug (slug),
    UNIQUE KEY uq_tenants_invite (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    display_name VARCHAR(40) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    terms_version VARCHAR(20) NOT NULL,
    terms_accepted_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Papel: 'student' ou 'tenant_admin' (validado na aplicação; o MySQL 5.7 ignora CHECK).
CREATE TABLE IF NOT EXISTS memberships (
    user_id INT UNSIGNED NOT NULL,
    tenant_id INT UNSIGNED NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, tenant_id),
    KEY idx_memberships_tenant (tenant_id),
    CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
