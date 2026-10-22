-- 002: contadores do limite de tentativas (login e cadastro), no modelo do ai_rate_limit: um contador por chave e
-- janela de 15 min, com INSERT ... ON DUPLICATE KEY UPDATE atômico. A chave é um hash (sal + e-mail + IP, ou sal + IP):
-- nenhum e-mail ou IP fica em claro nesta tabela.
CREATE TABLE IF NOT EXISTS auth_rate_limit (
    bucket_key CHAR(64) NOT NULL,
    window_key INT UNSIGNED NOT NULL,
    hits INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key, window_key),
    KEY idx_auth_rate_limit_window (window_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
