-- 003: códigos de recuperação de senha. Um código ativo por conta (a chave é a conta): pedir outro substitui o anterior.
-- Só o HMAC do código fica no banco; o código em claro existe apenas no e-mail.
-- attempts conta os erros: com 5, o código não vale mais. A limpeza dos vencidos é do Cron diário.
CREATE TABLE IF NOT EXISTS password_resets (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    code_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    KEY idx_password_resets_expires (expires_at),
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
