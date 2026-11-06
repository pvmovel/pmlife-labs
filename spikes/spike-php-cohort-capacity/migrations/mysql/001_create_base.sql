-- O estado de antes da US48, como no produto depois da US44 (009_create_enrollments.sql), só com o que o spike usa:
-- a instituição, as turmas de cada curso (por período; a "padrao" sem fim) e a matrícula (uma por aluno e curso).
CREATE TABLE IF NOT EXISTS cc_tenants (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cc_cohorts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    slug VARCHAR(20) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NULL,
    UNIQUE KEY uq_cc_cohorts_course_slug (tenant_id, course_id, slug),
    CONSTRAINT fk_cc_cohorts_tenant FOREIGN KEY (tenant_id) REFERENCES cc_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cc_enrollments (
    tenant_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    status VARCHAR(10) NOT NULL,
    cohort_id INT UNSIGNED NULL,
    requested_at DATETIME NOT NULL,
    PRIMARY KEY (tenant_id, user_id, course_id),
    KEY ix_cc_enrollments_cohort (tenant_id, cohort_id, status),
    CONSTRAINT fk_cc_enrollments_tenant FOREIGN KEY (tenant_id) REFERENCES cc_tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_cc_enrollments_cohort FOREIGN KEY (cohort_id) REFERENCES cc_cohorts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
