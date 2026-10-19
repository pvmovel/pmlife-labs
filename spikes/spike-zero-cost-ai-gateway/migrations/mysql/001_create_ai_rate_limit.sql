-- Contadores do rate limit do gateway de IA (PdoRateLimitStore). Compatível com MySQL 5.7 e 8.x.
CREATE TABLE IF NOT EXISTS ai_rate_limit (
  bucket_key VARCHAR(64) NOT NULL,   -- sha256(sal|IP) ou "global"
  window_key VARCHAR(20) NOT NULL,   -- "m:2026-10-18T14:05" ou "d:2026-10-18"
  hits       INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_key),
  KEY idx_window (window_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
