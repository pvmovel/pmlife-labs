-- 002: contadores dos limites (a mesma tabela da US30). bucket_key = sha256 com sal: nenhum e-mail nem IP em claro.
CREATE TABLE IF NOT EXISTS auth_rate_limit (
    bucket_key CHAR(64) NOT NULL,
    window_key INTEGER NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key, window_key)
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_window ON auth_rate_limit (window_key);
