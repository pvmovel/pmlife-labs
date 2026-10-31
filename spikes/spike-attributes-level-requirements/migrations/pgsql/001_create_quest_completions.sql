-- 001: as missões concluídas como estão hoje (curso + missão, sem versão). O XP nunca é guardado: é derivado.
CREATE TABLE IF NOT EXISTS quest_completions (
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    track_id VARCHAR(80) NOT NULL,
    quest_id VARCHAR(40) NOT NULL,
    completed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (tenant_id, user_id, track_id, quest_id)
);
CREATE INDEX IF NOT EXISTS idx_quest_completions_user ON quest_completions (user_id, tenant_id);

INSERT INTO schema_migrations (version) SELECT '001'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001');
