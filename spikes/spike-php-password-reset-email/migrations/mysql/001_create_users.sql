-- 001: contas (o mínimo da US30 para o spike) com a versão das credenciais.
-- credentials_version sobe a cada troca de senha: a sessão guarda a versão do login e cai quando ela muda,
-- o que encerra as sessões abertas em outros aparelhos sem precisar listar os arquivos de sessão.
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    credentials_version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
