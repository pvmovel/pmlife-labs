-- 001: instituições (o mínimo da US30 para o spike). O slug entra no id dos cursos da instituição
-- ("<slug>.<curso>"), por isso segue a mesma regra curta: minúsculas, dígitos e hífen.
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL
);
