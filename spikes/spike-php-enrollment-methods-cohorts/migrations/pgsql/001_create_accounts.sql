-- 001: o mínimo das contas (US30) para o spike: instituições, pessoas e o vínculo entre elas (o papel).
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(20) NOT NULL,
    CONSTRAINT uq_tenants_slug UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    role VARCHAR(20) NOT NULL,
    PRIMARY KEY (user_id, tenant_id),
    CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- O limite de tentativas da US30: uma linha por chave (hash) e janela de 15 min.
CREATE TABLE IF NOT EXISTS auth_rate_limit (
    bucket_key CHAR(64) NOT NULL,
    window_key INTEGER NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key, window_key)
);
