-- PoC da US58: o quiz corrigido no servidor. No produto, as tabelas ficam no banco de cada instituição (a próxima
-- migration de mysql-tenant/), e o documento do curso guarda só a referência do quiz. Compatível com o MySQL 5.7 da
-- hospedagem: sem CTE, sem window functions e sem funções de JSON (o JSON fica em TEXT e é lido pelo PHP).
--
-- poc_quizzes: a configuração (quantas questões sortear, a nota de corte, as tentativas e a espera depois de reprovar).
-- poc_quiz_questions: o banco de questões. `content` vai ao navegador (embaralhado); `answer` (o gabarito) e
--   `rationale` (a justificativa, só depois de enviar) nunca vão junto com as questões.
-- poc_quiz_attempts: cada tentativa guarda a semente do sorteio; a correção refaz o sorteio a partir dela.
CREATE TABLE IF NOT EXISTS poc_quizzes (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    draw_count TINYINT UNSIGNED NOT NULL,
    pass_percent TINYINT UNSIGNED NOT NULL DEFAULT 70,
    max_attempts SMALLINT UNSIGNED NULL DEFAULT NULL,
    cooldown_seconds INT UNSIGNED NOT NULL DEFAULT 600,
    reward_xp SMALLINT UNSIGNED NOT NULL DEFAULT 100
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poc_quiz_questions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    quiz_id VARCHAR(40) NOT NULL,
    kind VARCHAR(12) NOT NULL,
    prompt VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    answer TEXT NOT NULL,
    rationale VARCHAR(500) NULL,
    KEY ix_poc_quiz_questions_quiz (quiz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poc_quiz_attempts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    quiz_id VARCHAR(40) NOT NULL,
    learner CHAR(16) NOT NULL,
    seed INT UNSIGNED NOT NULL,
    started_at DATETIME NOT NULL,
    submitted_at DATETIME NULL DEFAULT NULL,
    correct TINYINT UNSIGNED NULL DEFAULT NULL,
    score TINYINT UNSIGNED NULL DEFAULT NULL,
    passed TINYINT(1) NULL DEFAULT NULL,
    KEY ix_poc_quiz_attempts_learner (learner, quiz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
