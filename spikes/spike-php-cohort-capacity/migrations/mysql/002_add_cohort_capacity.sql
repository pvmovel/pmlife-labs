-- 002 (US48): o limite das turmas em múltiplos de 4. MySQL 5.7 (HostGator) e 8.x: sem CHECK (o 5.7 ignora; a regra
-- fica no Domain, nos dois lados) e sem "ADD COLUMN IF NOT EXISTS". Idempotente: pode rodar no phpMyAdmin quantas
-- vezes for preciso. Ordem segura: roda ANTES do deploy do código; os DEFAULT deixam o código anterior funcionando.
-- Sem mover dados: as turmas de hoje ganham o limite padrão (12), e ninguém sai delas.

-- O teto da instituição (definido pelo master da plataforma).
SET @add_ceiling = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cc_tenants' AND COLUMN_NAME = 'cohort_ceiling');
SET @ddl_ceiling = IF(@add_ceiling, 'ALTER TABLE cc_tenants ADD COLUMN cohort_ceiling TINYINT UNSIGNED NOT NULL DEFAULT 12', 'DO 0');
PREPARE ceiling_stmt FROM @ddl_ceiling;
EXECUTE ceiling_stmt;
DEALLOCATE PREPARE ceiling_stmt;

-- O limite gravado em cada turma.
SET @add_capacity = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cc_cohorts' AND COLUMN_NAME = 'capacity');
SET @ddl_capacity = IF(@add_capacity, 'ALTER TABLE cc_cohorts ADD COLUMN capacity TINYINT UNSIGNED NOT NULL DEFAULT 12', 'DO 0');
PREPARE capacity_stmt FROM @ddl_capacity;
EXECUTE capacity_stmt;
DEALLOCATE PREPARE capacity_stmt;

-- A matrícula de equipe (o master): não ocupa vaga e fica sem turma.
SET @add_staff = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cc_enrollments' AND COLUMN_NAME = 'staff');
SET @ddl_staff = IF(@add_staff, 'ALTER TABLE cc_enrollments ADD COLUMN staff TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE staff_stmt FROM @ddl_staff;
EXECUTE staff_stmt;
DEALLOCATE PREPARE staff_stmt;

-- O limite que a instituição escolheu para cada curso. A linha também é a trava da matrícula: quem matricula trava a
-- linha do curso (SELECT ... FOR UPDATE), então duas matrículas ao mesmo tempo não passam do limite.
CREATE TABLE IF NOT EXISTS cc_course_cohort_settings (
    tenant_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    cohort_size TINYINT UNSIGNED NOT NULL DEFAULT 12,
    PRIMARY KEY (tenant_id, course_id),
    CONSTRAINT fk_cc_settings_tenant FOREIGN KEY (tenant_id) REFERENCES cc_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
