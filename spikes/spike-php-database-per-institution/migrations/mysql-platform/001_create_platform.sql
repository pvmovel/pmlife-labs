-- O banco da plataforma do spike (fictício): as instituições com o estado do banco de cada uma, o cadastro mínimo
-- para entrar, os vínculos e uma tabela de hoje com tenant_id (progress_events), que a Etapa B muda de banco.
CREATE TABLE tenants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  db_state ENUM('waiting', 'migrating', 'active') NOT NULL DEFAULT 'waiting',
  db_version CHAR(3) NULL,
  db_error VARCHAR(255) NULL,
  db_checked_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  platform_admin TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE memberships (
  user_id INT UNSIGNED NOT NULL,
  tenant_id INT UNSIGNED NOT NULL,
  role ENUM('student', 'tutor', 'tenant_admin') NOT NULL,
  PRIMARY KEY (user_id, tenant_id),
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE progress_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  course_id VARCHAR(40) NOT NULL,
  quest_id VARCHAR(40) NOT NULL,
  xp INT NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_progress_tenant (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
