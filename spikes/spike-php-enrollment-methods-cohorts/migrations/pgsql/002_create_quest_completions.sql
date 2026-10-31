-- 002: as missões concluídas como estão hoje (US31/US43): o progresso que a matrícula precisa preservar.
CREATE TABLE IF NOT EXISTS quest_completions (
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    track_id VARCHAR(40) NOT NULL,
    quest_id VARCHAR(40) NOT NULL,
    completed_at TIMESTAMP NOT NULL,
    PRIMARY KEY (tenant_id, user_id, track_id, quest_id),
    CONSTRAINT fk_quest_completions_membership FOREIGN KEY (user_id, tenant_id) REFERENCES memberships (user_id, tenant_id) ON DELETE CASCADE
);
