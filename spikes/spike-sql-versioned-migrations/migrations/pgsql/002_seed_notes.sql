-- 002: seed idempotente (não duplica se rodar de novo ou se o dado já existir).
-- PostgreSQL aceita SELECT com WHERE sem FROM (não existe DUAL).
INSERT INTO notes (title) SELECT 'Primeira nota'
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE title = 'Primeira nota');

INSERT INTO notes (title) SELECT 'Segunda nota'
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE title = 'Segunda nota');
