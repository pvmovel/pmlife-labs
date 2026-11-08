-- O progresso no banco da instituição: as mesmas colunas de hoje, sem tenant_id (o banco já é da instituição). O id
-- vem da origem na Etapa B, por isso não pode colidir: o AUTO_INCREMENT começa alto, e as linhas movidas mantêm o id.
CREATE TABLE progress_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  course_id VARCHAR(40) NOT NULL,
  quest_id VARCHAR(40) NOT NULL,
  xp INT NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_progress_user (user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=1000000;
