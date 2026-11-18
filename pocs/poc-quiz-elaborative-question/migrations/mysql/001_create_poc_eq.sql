-- PoC da US59: a questão em 2 etapas (a resposta e o porquê), sobre o quiz corrigido no servidor da US58. As tabelas
-- são as da PoC da US58 com outro prefixo (poc_eq_), para as duas demos ficarem no ar juntas no mesmo banco. No produto,
-- elas já existem (a migration 010 da instituição): a questão nova é só um `kind` a mais, e a nota com meio ponto pede
-- os pontos em meios pontos. Compatível com o MySQL 5.7 da hospedagem: sem CTE, sem window functions e sem funções de
-- JSON (o JSON fica em TEXT e é lido pelo PHP).
--
-- poc_eq_quizzes: a configuração (quantas questões sortear, a nota de corte, as tentativas e a espera depois de reprovar).
-- poc_eq_questions: o banco de questões. `content` vai ao navegador (embaralhado); `answer` (o gabarito) e `rationale`
--   (a justificativa, só depois de enviar) nunca vão junto com as questões.
-- poc_eq_attempts: cada tentativa guarda a semente do sorteio; a correção refaz o sorteio a partir dela. `half_points`
--   são os pontos em meios pontos inteiros (4,5 de 5 ➔ 9), para a conta da nota ficar exata.
CREATE TABLE IF NOT EXISTS poc_eq_quizzes (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    draw_count TINYINT UNSIGNED NOT NULL,
    pass_percent TINYINT UNSIGNED NOT NULL DEFAULT 70,
    max_attempts SMALLINT UNSIGNED NULL DEFAULT NULL,
    cooldown_seconds INT UNSIGNED NOT NULL DEFAULT 600,
    reward_xp SMALLINT UNSIGNED NOT NULL DEFAULT 100
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poc_eq_questions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    quiz_id VARCHAR(40) NOT NULL,
    kind VARCHAR(12) NOT NULL,
    prompt VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    answer TEXT NOT NULL,
    rationale VARCHAR(500) NULL,
    KEY ix_poc_eq_questions_quiz (quiz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poc_eq_attempts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    quiz_id VARCHAR(40) NOT NULL,
    learner CHAR(16) NOT NULL,
    seed INT UNSIGNED NOT NULL,
    started_at DATETIME NOT NULL,
    submitted_at DATETIME NULL DEFAULT NULL,
    half_points SMALLINT UNSIGNED NULL DEFAULT NULL,
    score TINYINT UNSIGNED NULL DEFAULT NULL,
    passed TINYINT(1) NULL DEFAULT NULL,
    KEY ix_poc_eq_attempts_learner (learner, quiz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
