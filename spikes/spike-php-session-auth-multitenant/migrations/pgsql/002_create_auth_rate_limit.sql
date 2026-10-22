-- 002: contadores do limite de tentativas (login e cadastro); upsert com ON CONFLICT. Chaves só como hash.
CREATE TABLE IF NOT EXISTS auth_rate_limit (
    bucket_key CHAR(64) NOT NULL,
    window_key INT NOT NULL,
    hits INT NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key, window_key)
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_window ON auth_rate_limit (window_key);
