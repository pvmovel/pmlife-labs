# Spike: credenciais fora do webroot em hospedagem compartilhada (PHP + cPanel)

## Problema

Em hospedagem compartilhada é comum encontrar:

- senha do banco escrita direto em `db.php`, versionada no git e publicada no servidor;
- `catch (PDOException $e) { echo $e->getMessage(); }` vazando usuário, host e nome do banco para qualquer visitante;
- `Access-Control-Allow-Origin: *` sem necessidade e nenhum header de segurança.

Há ainda uma armadilha específica de SPAs com **Vite**: tudo o que está em `public/` é copiado para `dist/`, e o deploy por FTP publica `dist/` inteiro. Um `.env` "de exemplo" deixado em `public/` acaba no webroot.

## Solução

```
/home<N>/<conta>/                 <- home da conta (o caminho varia: nunca fixe)
├── app.homolog.env.php           <- credenciais de homolog (chmod 600)
├── app.production.env.php        <- credenciais de produção (chmod 600)
└── public_html/                  <- webroot (DOCUMENT_ROOT)
    ├── .htaccess
    └── status.php                <- controller fino
```

| Arquivo | Papel |
| :--- | :--- |
| `src/env-loader.php` | `detect_env()` deduz o ambiente pelo host (ou `APP_ENV`); `load_env()` procura `app.<env>.env.php` em `$HOME` e depois nos diretórios acima do `DOCUMENT_ROOT`. O nome do ambiente passa por uma lista permitida, o que impede path traversal. |
| `src/db.php` | Monta o DSN a partir de `DB_DRIVER` (`mysql`/`pgsql`) e abre o PDO. Em qualquer falha grava o detalhe com `error_log()` e responde `500 {"status":"error","error":{"code":"DB_UNAVAILABLE"}}`. |
| `public/status.php` | Endpoint de exemplo (`SELECT 1`). |
| `public/.htaccess` | Força HTTPS, nega `*.env.php`, `.env`, `.git*` e `.ht*`, desliga a listagem de diretórios e adiciona HSTS, `nosniff`, `X-Frame-Options` e `Referrer-Policy`. |
| `config/env.example.php` | Modelo versionado com valores fictícios, **fora** de `public/`. |

Princípios:

1. **Um arquivo de env por ambiente**, com usuário e senha de banco distintos.
2. **Nenhum caminho absoluto no código**: o home muda de servidor para servidor.
3. **Erros opacos para o cliente, detalhados no log.** O cliente recebe só um `code` estável, e o front traduz esse código para uma mensagem amigável.
4. **Driver no env**: trocar MySQL por PostgreSQL vira uma mudança de configuração (mais migrations no outro dialeto), sem tocar nos controllers.
5. **Rotacionar a senha** se ela já esteve no git. Limpar o histórico não basta, porque clones e forks continuam com ela.

## Como testar localmente

```bash
# 1) env fictício num "home" temporário
mkdir -p /tmp/fake-home
cp config/env.example.php /tmp/fake-home/app.development.env.php

# 2) sobe o servidor embutido com esse HOME
HOME=/tmp/fake-home php -S 127.0.0.1:8765 -t public

# 3) em outro terminal
curl -i http://127.0.0.1:8765/status.php
# -> HTTP 500 {"status":"error","error":{"code":"DB_UNAVAILABLE"}}
#    (o motivo real, ex. "Access denied for user", aparece só no terminal do servidor)
```

Com credenciais válidas de um MySQL ou PostgreSQL local, a resposta passa a ser `200 {"status":"success","data":{"db":"up"}}`.

Fallback pelo `DOCUMENT_ROOT` (simula `home/public_html` sem `$HOME`):

```bash
mkdir -p /tmp/h/conta/public_html
echo "<?php return ['DB_NAME'=>'ok'];" > /tmp/h/conta/app.homolog.env.php
env -u HOME php -r '$_SERVER["DOCUMENT_ROOT"]=$argv[1]; require "src/env-loader.php";
  var_dump(load_env(detect_env("homolog.example.com")));' /tmp/h/conta/public_html
```

## Compatibilidade

PHP 7.4+ (o alvo é 8.2). Sem Composer nem dependências; só a extensão PDO com o driver do banco.
