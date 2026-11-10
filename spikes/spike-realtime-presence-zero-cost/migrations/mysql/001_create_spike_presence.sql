-- Presença por polling (spike da US41): uma linha por aluno online, atualizada a cada batida.
-- No produto, a tabela fica no banco de cada instituição (então sem tenant_id). No labs há um banco só, e o tenant_id
-- simula as instituições, para provar o isolamento. Rodar uma vez no banco do labs (o usuário do site não tem DDL).
CREATE TABLE IF NOT EXISTS spike_presence (
    tenant_id SMALLINT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    city VARCHAR(40) NOT NULL,
    cohort VARCHAR(20) NOT NULL,
    name VARCHAR(40) NOT NULL,
    staff TINYINT(1) NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    x SMALLINT NOT NULL,
    z SMALLINT NOT NULL,
    ry SMALLINT NOT NULL,
    seen_at DATETIME(3) NOT NULL,
    moved_at DATETIME(3) NOT NULL,
    PRIMARY KEY (tenant_id, user_id),
    KEY idx_spike_presence_room (tenant_id, city, cohort, seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
