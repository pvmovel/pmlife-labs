-- Spike da US45: os certificados verificáveis. No produto, a tabela fica no banco de cada instituição (sem a coluna de
-- instituição). O certificado guarda uma foto do momento da emissão (o nome, o curso e a instituição), como um documento:
-- se o nome mudar depois, o certificado continua dizendo o que dizia. O e-mail não fica aqui: só o hash dele com sal,
-- que o padrão Open Badges 2.0 pede para identificar quem recebeu sem expor o endereço.
CREATE TABLE IF NOT EXISTS spike_certificates (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code CHAR(20) NOT NULL,
    tenant_id SMALLINT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(40) NOT NULL,
    student_name VARCHAR(40) NOT NULL,
    course_title VARCHAR(120) NOT NULL,
    institution_name VARCHAR(80) NOT NULL,
    completed_on DATE NOT NULL,
    issued_at DATETIME NOT NULL,
    salt CHAR(32) NOT NULL,
    identity_hash CHAR(64) NOT NULL,
    UNIQUE KEY uq_spike_certificates_code (code),
    UNIQUE KEY uq_spike_certificates_owner (tenant_id, user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
