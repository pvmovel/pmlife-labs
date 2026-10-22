-- 003: dado de exemplo com escopo de tenant (o progresso do aluno). A 004 liga o RLS nesta tabela.
CREATE TABLE IF NOT EXISTS progress_events (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    user_id INT NOT NULL,
    quest_id VARCHAR(40) NOT NULL,
    xp INT NOT NULL CHECK (xp >= 0),
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id, tenant_id) REFERENCES memberships (user_id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_progress_tenant_user ON progress_events (tenant_id, user_id);
