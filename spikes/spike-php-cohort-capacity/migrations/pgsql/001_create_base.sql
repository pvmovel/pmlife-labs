-- O estado de antes da US48 (o mesmo da versão MySQL): a instituição, as turmas e a matrícula.
CREATE TABLE IF NOT EXISTS cc_tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS cc_cohorts (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES cc_tenants (id) ON DELETE CASCADE,
    course_id VARCHAR(40) NOT NULL,
    slug VARCHAR(20) NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NULL,
    CONSTRAINT uq_cc_cohorts_course_slug UNIQUE (tenant_id, course_id, slug)
);

CREATE TABLE IF NOT EXISTS cc_enrollments (
    tenant_id INTEGER NOT NULL REFERENCES cc_tenants (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    status VARCHAR(10) NOT NULL,
    cohort_id INTEGER NULL REFERENCES cc_cohorts (id) ON DELETE CASCADE,
    requested_at TIMESTAMP NOT NULL,
    PRIMARY KEY (tenant_id, user_id, course_id)
);
CREATE INDEX IF NOT EXISTS ix_cc_enrollments_cohort ON cc_enrollments (tenant_id, cohort_id, status);
