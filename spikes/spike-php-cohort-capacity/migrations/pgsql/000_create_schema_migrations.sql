-- Controle das migrations do spike (prefixo cc_: os spikes do CI dividem o mesmo banco).
CREATE TABLE IF NOT EXISTS cc_schema_migrations (
    version CHAR(3) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
