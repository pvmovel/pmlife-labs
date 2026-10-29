-- 002: contadores dos limites (a mesma tabela da US30). bucket_key = sha256 com sal: nenhum e-mail nem IP em claro.
CREATE TABLE IF NOT EXISTS auth_rate_limit (
    bucket_key CHAR(64) NOT NULL,
    window_key INT UNSIGNED NOT NULL,
    hits INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key, window_key),
    KEY idx_auth_rate_limit_window (window_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
