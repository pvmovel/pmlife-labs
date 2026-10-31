-- 003 (US44): matrícula por curso e turmas. MySQL 5.7: sem CHECK (o método e o estado são validados na aplicação).
-- A regra de matrícula de cada curso; sem linha, a matrícula é livre. O código de convite só como HMAC (code_hash).
CREATE TABLE IF NOT EXISTS course_enrollment_rules (
    tenant_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    method VARCHAR(12) NOT NULL,
    code_hash CHAR(64) NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (tenant_id, course_id),
    CONSTRAINT fk_enrollment_rules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Turmas: os alunos de um curso por período. A turma "padrao" (sem fim) recebe quem se matricula sem turma aberta.
CREATE TABLE IF NOT EXISTS cohorts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    slug VARCHAR(20) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NULL,
    UNIQUE KEY uq_cohorts_course_slug (tenant_id, course_id, slug),
    UNIQUE KEY uq_cohorts_id_tenant (id, tenant_id),
    CONSTRAINT fk_cohorts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A matrícula: uma por aluno e curso. status: active, pending (aguardando o admin) ou rejected. A turma é escolhida
-- quando a matrícula fica ativa (pending fica sem turma).
CREATE TABLE IF NOT EXISTS enrollments (
    tenant_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    status VARCHAR(10) NOT NULL,
    cohort_id INT UNSIGNED NULL,
    requested_at DATETIME NOT NULL,
    decided_at DATETIME NULL,
    PRIMARY KEY (tenant_id, user_id, course_id),
    KEY idx_enrollments_course (tenant_id, course_id, status),
    CONSTRAINT fk_enrollments_membership FOREIGN KEY (user_id, tenant_id) REFERENCES memberships (user_id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollments_cohort FOREIGN KEY (cohort_id, tenant_id) REFERENCES cohorts (id, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
