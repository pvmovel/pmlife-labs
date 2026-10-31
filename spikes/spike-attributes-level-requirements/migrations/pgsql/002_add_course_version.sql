-- 002 (US43): cada conclusão guarda a versão do curso em que valeu (os pontos são os dessa versão).
-- As linhas de hoje ficam na versão 1, a única que existia quando foram gravadas. Depois o DEFAULT sai: toda
-- conclusão nova diz a versão. Idempotente.
ALTER TABLE quest_completions ADD COLUMN IF NOT EXISTS course_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE quest_completions ALTER COLUMN course_version DROP DEFAULT;

INSERT INTO schema_migrations (version) SELECT '002'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002');
