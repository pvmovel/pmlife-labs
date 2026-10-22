-- 003: dado de exemplo com escopo de tenant (o progresso do aluno). Toda leitura passa pelo TenantScopedRepository,
-- que exige o filtro por tenant_id: o MySQL 5.7 não tem RLS, então o isolamento é garantido na aplicação.
CREATE TABLE IF NOT EXISTS progress_events (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    quest_id VARCHAR(40) NOT NULL,
    xp INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_progress_tenant_user (tenant_id, user_id),
    CONSTRAINT fk_progress_membership FOREIGN KEY (user_id, tenant_id) REFERENCES memberships (user_id, tenant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
