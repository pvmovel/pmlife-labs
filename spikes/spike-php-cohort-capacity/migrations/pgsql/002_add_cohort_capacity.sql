-- 002 (US48): o limite das turmas em múltiplos de 4 (o mesmo da versão MySQL). No PostgreSQL, o CHECK funciona e
-- entra como segunda defesa; a regra continua no Domain.
ALTER TABLE cc_tenants ADD COLUMN IF NOT EXISTS cohort_ceiling SMALLINT NOT NULL DEFAULT 12;
ALTER TABLE cc_cohorts ADD COLUMN IF NOT EXISTS capacity SMALLINT NOT NULL DEFAULT 12;
ALTER TABLE cc_enrollments ADD COLUMN IF NOT EXISTS staff SMALLINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS cc_course_cohort_settings (
    tenant_id INTEGER NOT NULL REFERENCES cc_tenants (id) ON DELETE CASCADE,
    course_id VARCHAR(40) NOT NULL,
    cohort_size SMALLINT NOT NULL DEFAULT 12 CHECK (cohort_size BETWEEN 4 AND 48 AND cohort_size % 4 = 0),
    PRIMARY KEY (tenant_id, course_id)
);
