-- 002 (US43): cada conclusão guarda a versão do curso em que valeu (os pontos são os dessa versão).
-- MySQL 5.7 não tem ADD COLUMN IF NOT EXISTS: a coluna só é criada se ainda não existe (idempotente, pode rodar de
-- novo no phpMyAdmin; o ramo vazio é DO 0, que não devolve resultado e não trava o PDO). As linhas de hoje ficam na
-- versão 1, a única que existia quando foram gravadas. Depois o DEFAULT sai: toda conclusão nova diz a versão.
SET @has_version := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quest_completions' AND COLUMN_NAME = 'course_version');
SET @ddl := IF(@has_version = 0,
    'ALTER TABLE quest_completions ADD COLUMN course_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER quest_id',
    'DO 0');
PREPARE add_course_version FROM @ddl;
EXECUTE add_course_version;
DEALLOCATE PREPARE add_course_version;
ALTER TABLE quest_completions ALTER COLUMN course_version DROP DEFAULT;

INSERT INTO schema_migrations (version) SELECT '002' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002');
