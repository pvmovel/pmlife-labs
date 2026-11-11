-- Spike da US42: o chat por turma (turma, perto e privado) com moderação, por polling curto no PHP e no MySQL. No
-- produto, as tabelas ficam no banco de cada instituição (sem a coluna de instituição) e as pessoas vêm da réplica do
-- cadastro e da presença. Aqui, a demo cria as pessoas fictícias na entrada.

-- Quem está na demo: a instituição, a turma, o papel e a posição (em decímetros, como a presença da US41).
CREATE TABLE IF NOT EXISTS spike_chat_people (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id SMALLINT UNSIGNED NOT NULL,
    cohort VARCHAR(10) NOT NULL,
    name VARCHAR(40) NOT NULL,
    role VARCHAR(10) NOT NULL,
    place VARCHAR(40) NOT NULL DEFAULT '',
    x SMALLINT NOT NULL DEFAULT 0,
    z SMALLINT NOT NULL DEFAULT 0,
    seen_at DATETIME(3) NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_spike_chat_room (tenant_id, cohort, place, seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- As mensagens: o canal (cohort, near ou private), o lugar (no "perto"), quem mandou (da sessão) e, no privado, para
-- quem. O relógio é o do banco.
CREATE TABLE IF NOT EXISTS spike_chat_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id SMALLINT UNSIGNED NOT NULL,
    cohort VARCHAR(10) NOT NULL,
    channel VARCHAR(8) NOT NULL,
    place VARCHAR(40) NOT NULL DEFAULT '',
    sender_id INT UNSIGNED NOT NULL,
    recipient_id INT UNSIGNED NULL,
    body VARCHAR(500) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    KEY idx_spike_chat_cohort (tenant_id, cohort, id),
    KEY idx_spike_chat_sender (sender_id, created_at),
    KEY idx_spike_chat_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quem recebe cada mensagem "de perto": decidido no envio, pela posição de cada um (até 5 m).
CREATE TABLE IF NOT EXISTS spike_chat_deliveries (
    user_id INT UNSIGNED NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, message_id),
    KEY idx_spike_chat_delivery_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quem bloqueou quem: as mensagens de quem foi bloqueado somem para quem bloqueou, em todos os canais.
CREATE TABLE IF NOT EXISTS spike_chat_blocks (
    blocker_id INT UNSIGNED NOT NULL,
    blocked_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- As denúncias: a mensagem denunciada fica guardada até a denúncia ser resolvida e mais 1 ano.
CREATE TABLE IF NOT EXISTS spike_chat_reports (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id SMALLINT UNSIGNED NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    reporter_id INT UNSIGNED NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open',
    created_at DATETIME NOT NULL,
    resolved_at DATETIME NULL,
    UNIQUE KEY uq_spike_chat_report (message_id, reporter_id),
    KEY idx_spike_chat_reports (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- O chat de cada curso da instituição: ligado, o privado (começa desligado) e as palavras recusadas.
CREATE TABLE IF NOT EXISTS spike_chat_settings (
    tenant_id SMALLINT UNSIGNED NOT NULL,
    course VARCHAR(40) NOT NULL,
    chat_on TINYINT(1) NOT NULL DEFAULT 1,
    private_on TINYINT(1) NOT NULL DEFAULT 0,
    words VARCHAR(2000) NOT NULL DEFAULT '',
    PRIMARY KEY (tenant_id, course)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
