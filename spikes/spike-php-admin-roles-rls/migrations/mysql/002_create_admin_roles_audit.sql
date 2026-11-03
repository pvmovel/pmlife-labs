-- 002 (US36): o admin. MySQL 5.7 (HostGator) e 8.x: sem CHECK, sem "ADD COLUMN IF NOT EXISTS" (só no MariaDB) e
-- sem trigger (na hospedagem compartilhada, criar trigger pode exigir o privilégio SUPER). Idempotente: pode rodar no
-- phpMyAdmin quantas vezes for preciso. O ramo vazio é DO 0, que não devolve resultado para quem roda pelo PDO.
--
-- Desativar não apaga nada: a instituição e o vínculo ganham "active", e o progresso e as matrículas ficam guardados.
SET @add_tenant_active = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'active');
SET @ddl_tenant = IF(@add_tenant_active, 'ALTER TABLE tenants ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER name', 'DO 0');
PREPARE tenant_active_stmt FROM @ddl_tenant;
EXECUTE tenant_active_stmt;
DEALLOCATE PREPARE tenant_active_stmt;

SET @add_member_active = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'memberships' AND COLUMN_NAME = 'active');
SET @ddl_member = IF(@add_member_active, 'ALTER TABLE memberships ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER role', 'DO 0');
PREPARE member_active_stmt FROM @ddl_member;
EXECUTE member_active_stmt;
DEALLOCATE PREPARE member_active_stmt;

-- A conta criada pelo master da plataforma (o master de uma instituição nova) ainda não aceitou os termos: aceita no
-- primeiro acesso, depois de definir a senha pelo "Esqueci a senha" (US39). MODIFY com a mesma definição não muda nada.
ALTER TABLE users MODIFY terms_version VARCHAR(20) NULL, MODIFY terms_accepted_at DATETIME NULL;

-- Master da plataforma: um papel FORA do escopo de instituição. created_by NULL = o primeiro, criado pelo SQL de ops/.
CREATE TABLE IF NOT EXISTS platform_admins (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    created_at DATETIME NOT NULL,
    created_by INT UNSIGNED NULL,
    CONSTRAINT fk_platform_admins_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_platform_admins_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Papel num curso (ADR-012, contexto de curso): 'author' (edita e publica só esse curso) ou 'tutor' (acompanha os
-- alunos dele). A FK para o vínculo impede designar quem não é da instituição.
CREATE TABLE IF NOT EXISTS course_staff (
    tenant_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    role VARCHAR(10) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (tenant_id, course_id, user_id),
    KEY idx_course_staff_user (tenant_id, user_id),
    CONSTRAINT fk_course_staff_membership FOREIGN KEY (user_id, tenant_id) REFERENCES memberships (user_id, tenant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Auditoria: quem fez o quê, quando e onde. Só INSERT e SELECT na aplicação (nenhum método altera ou apaga). Sem FK:
-- a linha fica mesmo se a conta ou a instituição sumir. tenant_id NULL = ação da plataforma (nenhuma instituição vê).
-- O alvo é o nome ou o identificador, nunca o e-mail (LGPD: dado mínimo). actor_scope 'platform' marca a ação do
-- master da plataforma: a instituição vê "equipe da plataforma", sem o nome de quem fez.
CREATE TABLE IF NOT EXISTS admin_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME NOT NULL,
    actor_user_id INT UNSIGNED NULL,
    actor_scope VARCHAR(10) NOT NULL,
    tenant_id INT UNSIGNED NULL,
    action VARCHAR(40) NOT NULL,
    target VARCHAR(160) NOT NULL,
    KEY idx_admin_audit_tenant (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
