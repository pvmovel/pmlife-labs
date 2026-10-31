-- 004 (US44): ninguém perde o que já fez. Quem tem conclusões num curso fica matriculado nele (ativo, na turma padrão
-- do curso, criada aqui se faltar). Idempotente: rodar de novo não cria nada (NOT EXISTS).
INSERT INTO cohorts (tenant_id, course_id, slug, starts_at, ends_at)
SELECT DISTINCT q.tenant_id, q.track_id, 'padrao', CAST('1970-01-01 00:00:00' AS TIMESTAMP), CAST(NULL AS TIMESTAMP) FROM quest_completions q
WHERE NOT EXISTS (SELECT 1 FROM cohorts c WHERE c.tenant_id = q.tenant_id AND c.course_id = q.track_id AND c.slug = 'padrao');

INSERT INTO enrollments (tenant_id, user_id, course_id, status, cohort_id, requested_at, decided_at)
SELECT q.tenant_id, q.user_id, q.track_id, 'active', c.id, MIN(q.completed_at), MIN(q.completed_at)
FROM quest_completions q
JOIN cohorts c ON c.tenant_id = q.tenant_id AND c.course_id = q.track_id AND c.slug = 'padrao'
WHERE NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.tenant_id = q.tenant_id AND e.user_id = q.user_id AND e.course_id = q.track_id)
GROUP BY q.tenant_id, q.user_id, q.track_id, c.id;
