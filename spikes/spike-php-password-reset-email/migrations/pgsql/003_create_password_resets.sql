-- 003: códigos de recuperação de senha. Um código ativo por conta (a chave é a conta): pedir outro substitui o anterior.
-- Só o HMAC do código fica no banco; o código em claro existe apenas no e-mail.
-- attempts conta os erros: com 5, o código não vale mais. A limpeza dos vencidos é do Cron diário.
CREATE TABLE IF NOT EXISTS password_resets (
    user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets (expires_at);
