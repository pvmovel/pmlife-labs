-- 004 (só PostgreSQL): Row Level Security como segunda barreira (ADR-006: o caminho de escala troca MySQL por
-- PostgreSQL). A aplicação informa o tenant da sessão em app.tenant_id (set_config) e o banco filtra sozinho:
-- mesmo um SELECT sem WHERE só vê as linhas do tenant, e um INSERT para outro tenant é recusado.
-- FORCE vale também para o dono da tabela; superusuários continuam ignorando o RLS (a aplicação usa um papel comum).
ALTER TABLE progress_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON progress_events;
CREATE POLICY tenant_isolation ON progress_events
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
