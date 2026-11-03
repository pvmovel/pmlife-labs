-- US36: o PRIMEIRO master da plataforma. Os seguintes são criados pelo próprio admin (com auditoria).
-- Como usar (phpMyAdmin, aba SQL do banco):
--   1. crie a conta pelo cadastro normal (com o código de convite de uma instituição);
--   2. troque COLOQUE-O-EMAIL-AQUI pelo e-mail dessa conta, em minúsculas;
--   3. execute. Rodar de novo não duplica nada; com o marcador sem trocar, não insere ninguém.
-- Sem variável @: no phpMyAdmin a collation da conexão difere da coluna (erro #1267). created_by NULL marca que
-- veio deste SQL. Recuperação de senha: o "Esqueci a senha" (US39), como qualquer conta.
INSERT INTO platform_admins (user_id, created_at, created_by)
SELECT u.id, NOW(), NULL FROM users u
WHERE u.email = 'COLOQUE-O-EMAIL-AQUI'
  AND NOT EXISTS (SELECT 1 FROM platform_admins p WHERE p.user_id = u.id);

-- Conferir (deve listar a conta, com created_by vazio):
-- SELECT u.email, p.created_at, p.created_by FROM platform_admins p JOIN users u ON u.id = p.user_id;
