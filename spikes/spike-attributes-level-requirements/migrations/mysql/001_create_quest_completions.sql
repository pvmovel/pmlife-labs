-- 001: as missões concluídas como estão hoje (curso + missão, sem versão). O XP nunca é guardado: é derivado.
CREATE TABLE IF NOT EXISTS quest_completions (
    tenant_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    track_id VARCHAR(80) NOT NULL,
    quest_id VARCHAR(40) NOT NULL,
    completed_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (tenant_id, user_id, track_id, quest_id),
    KEY idx_quest_completions_user (user_id, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (version) SELECT '001' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001');
