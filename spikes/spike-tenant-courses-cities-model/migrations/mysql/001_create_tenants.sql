-- 001: instituições (o mínimo da US30 para o spike). O slug entra no id dos cursos da instituição
-- ("<slug>.<curso>"), por isso segue a mesma regra curta: minúsculas, dígitos e hífen.
CREATE TABLE IF NOT EXISTS tenants (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(20) NOT NULL,
    name VARCHAR(120) NOT NULL,
    UNIQUE KEY uq_tenants_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
