-- 002: seed idempotente (não duplica se rodar de novo ou se o dado já existir).
-- MySQL exige FROM DUAL para SELECT com WHERE sem tabela.
INSERT INTO notes (title) SELECT 'Primeira nota' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE title = 'Primeira nota');

INSERT INTO notes (title) SELECT 'Segunda nota' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE title = 'Segunda nota');
