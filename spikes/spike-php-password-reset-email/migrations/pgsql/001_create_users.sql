-- 001: contas (o mínimo da US30 para o spike) com a versão das credenciais.
-- credentials_version sobe a cada troca de senha: a sessão guarda a versão do login e cai quando ela muda,
-- o que encerra as sessões abertas em outros aparelhos sem precisar listar os arquivos de sessão.
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    credentials_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL
);
