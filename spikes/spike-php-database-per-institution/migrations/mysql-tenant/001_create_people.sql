-- A réplica do cadastro no banco da instituição: o mesmo id da plataforma, sem chave estrangeira entre os bancos
-- (cada banco fica independente; o script do Cron confere a integridade).
CREATE TABLE people (
  id INT UNSIGNED NOT NULL PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  role ENUM('student', 'tutor', 'tenant_admin', 'platform_admin') NOT NULL,
  staff TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
