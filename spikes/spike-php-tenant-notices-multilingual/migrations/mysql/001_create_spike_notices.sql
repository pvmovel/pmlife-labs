-- Spike da US40: os avisos da instituição por lugar (sede, cidade do curso ou fase), em Markdown, com o pt obrigatório
-- e o en opcional. No produto, a tabela fica no banco de cada instituição (sem a coluna de instituição).
CREATE TABLE IF NOT EXISTS spike_notices (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id SMALLINT UNSIGNED NOT NULL,
    place VARCHAR(90) NOT NULL,
    title_pt VARCHAR(120) NOT NULL,
    body_pt MEDIUMTEXT NOT NULL,
    title_en VARCHAR(120) NULL,
    body_en MEDIUMTEXT NULL,
    pinned TINYINT(1) NOT NULL DEFAULT 0,
    author VARCHAR(40) NOT NULL,
    published_at DATETIME NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    KEY idx_spike_notices_place (tenant_id, place, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
