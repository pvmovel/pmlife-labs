# Spike: contas e clientes separados, num PHP sem framework

## Problema

Um SaaS para escolas precisa de **contas** (o aluno guarda o progresso com segurança) e de **clientes isolados** (tenants: os dados de uma escola nunca aparecem para outra). As restrições:

- hospedagem compartilhada com **PHP 8.2 e MySQL 5.7**, sem Node no servidor, sem framework e **sem custo** (nada de provedor de identidade pago);
- o **MySQL 5.7 não tem Row Level Security**: o banco não filtra por cliente sozinho, então um `WHERE tenant_id = ?` esquecido numa única consulta já vaza dados de outra escola;
- alunos podem ser **menores de idade** (LGPD).

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Login | **E-mail e senha** | Custo zero e sem depender da entrega de e-mail. Link mágico pode vir depois. |
| Ligação com o cliente | **Código de convite** da instituição (ex.: `AURORA-2026`) | Sem e-mail institucional obrigatório; a escola troca o código quando quiser. |
| Papéis | `student` e `tenant_admin` | O mínimo para separar o aluno de quem vê o resumo da escola. |
| Conta em mais de uma escola | Permitida (vínculos N:N) | O login pergunta qual (`409 TENANT_REQUIRED`, com a lista). |
| Verificação de e-mail | **Não nesta fase** | O código de convite já limita quem entra; recuperação de senha é a próxima demanda. |
| LGPD com menores | **A instituição é a controladora** e coleta o consentimento dos responsáveis (contrato); o sistema guarda **dados mínimos** (e-mail, nome de exibição, progresso) e o **aceite dos termos com a versão** | Nada de data de nascimento, CPF ou telefone. |
| Sessão | Expira após **2 h sem uso** e **12 h após o login** | Sessões PHP em arquivo numa hospedagem compartilhada não são feitas para durar semanas; entrar de novo é barato. |

## Solução

```text
migrations/
├── mysql/001..003   tenants, users, memberships · auth_rate_limit · progress_events (exemplo com escopo de tenant)
└── pgsql/001..004   o mesmo + 004: Row Level Security em progress_events
src/
├── Auth/
│   ├── AuthApi.php              rotas, validação, CSRF e envelope {status, data|error}, sem depender do HTTP
│   ├── AuthService.php          cadastro por convite, login, sessão com expiração, logout
│   ├── PasswordPolicy.php       Argon2id (bcrypt de reserva), 12 a 128 caracteres, senhas comuns, rehash
│   ├── LoginThrottle.php        5 erros por conta+IP e 20 por IP, em janelas de 15 min (atual + anterior)
│   ├── PdoThrottleStore.php     contadores com upsert atômico nos dois dialetos; chaves só como hash
│   ├── NativeSessionStore.php   cookie __Host-, HttpOnly, Secure, SameSite=Lax, modo estrito
│   └── Csrf.php                 token sincronizador em todo POST (inclusive login e cadastro)
└── Tenant/
    ├── TenantScopedRepository.php   recusa SQL sem "tenant_id = :tenant_id" e preenche o tenant da sessão
    └── ProgressRepository.php       exemplo: progresso do aluno, resumo só para o admin do tenant
http/api/   me · register · login · logout · progress   (controllers finos; no labs respondem 403)
```

| Técnica | Por quê |
| :--- | :--- |
| **Isolamento num lugar só** | Todo repositório com dados de cliente herda o `TenantScopedRepository`: um SQL sem `tenant_id = :tenant_id` é **recusado antes de ir ao banco**, e o `:tenant_id` vem da sessão, nunca de quem chama. Esquecer o filtro vira um erro no teste, não um vazamento em produção. |
| **O tenant nunca vem do pedido** | Nem do corpo, nem da URL, nem de um cabeçalho: só da sessão no servidor. Um `tenantId` forjado no corpo é ignorado. |
| **RLS no PostgreSQL como 2ª barreira** | O caminho de escala troca MySQL por PostgreSQL. Lá, a migration 004 liga o RLS: o repositório informa o tenant (`set_config('app.tenant_id', …)`) e o banco filtra até um `SELECT` sem `WHERE`, e recusa gravar para outro tenant (`WITH CHECK`). |
| **Bloqueio antes da senha** | Com o par conta+IP bloqueado, a 6ª tentativa é recusada **mesmo com a senha certa**. De outro IP a conta entra: um atacante não tranca o aluno fora só errando a senha dele. |
| **Mesma resposta e mesmo tempo** | E-mail sem conta e senha errada dão o mesmo `401`, e o e-mail inexistente gasta o tempo de uma verificação real (sem enumeração por tempo). |
| **Sessão nova no login** | Login e cadastro trocam o ID da sessão e o token CSRF: um ID plantado antes do login não serve depois (fixação de sessão). |
| **Só JSON nos POSTs** | `Content-Type: application/json` obrigatório: um formulário de outro site não consegue montar o pedido, e o token CSRF fecha o resto. |

### Caminho para o PostgreSQL (ADR-006)

1. As migrations já existem nos dois dialetos (`migrations/mysql` e `migrations/pgsql`), e o mesmo código roda nos dois.
2. No PostgreSQL, aplicar a 004 (RLS) e fazer a aplicação conectar com um **papel comum**, dono de nada: superusuários ignoram o RLS, e o `FORCE ROW LEVEL SECURITY` cobre o dono da tabela.
3. O `TenantScopedRepository` continua: as duas barreiras juntas cobrem um SQL escrito fora dele (o RLS) e um banco configurado errado (o repositório).
4. Com conexões persistentes ou pool, usar `set_config(…, true)` dentro de cada transação, para o tenant não ficar grudado na conexão.

## O que o `verify` prova (104 checks)

**Sem banco:** Argon2id; 12 a 128 caracteres; senha comum ou igual ao e-mail recusada; rehash de hash antigo; token CSRF de 256 bits, comparação em tempo constante e troca; limite de tentativas (5 por conta+IP, outro IP e outra conta seguem livres, 20 por IP, o truque da virada de janela, queda após 30 min, reset no login certo).

**Em cada banco (MySQL e PostgreSQL reais):**

- **Gherkin: cadastro e login** — o visitante recebe o token CSRF; o cadastro com o código de convite entra na instituição; o `/api/me` mostra a instituição; a senha só existe como hash; o aceite dos termos fica registrado com a versão; logout e novo login.
- **Validações** — convite inexistente, termos não aceitos, senha curta, e-mail repetido e e-mail inválido, sem criar conta nem sessão.
- **CSRF** — token errado dá 403 (inclusive no login), formulário dá 415, e o login troca o ID da sessão.
- **Gherkin: tentativas limitadas** — 5 erros e a 6ª tentativa recebe `429` com `Retry-After`, mesmo com a senha certa; de outro IP entra; 30 min depois entra; e-mail sem conta recebe a mesma resposta; a tabela guarda só hashes.
- **Gherkin: isolamento entre clientes** — cada aluno só recebe o próprio progresso; adivinhar o ID de outro cliente não devolve nada; um `tenantId` forjado é ignorado; o visitante recebe 401; SQL sem filtro e tenant passado por fora são recusados; o admin vê o resumo só do próprio cliente; conta de duas escolas escolhe qual.
- **Sessão** — 2 h sem uso e 12 h após o login expiram.
- **Rehash** — hash antigo é refeito no próximo login.
- **PostgreSQL: RLS com um papel comum** — sem tenant, nada é visível; com o tenant A, até um `SELECT` sem `WHERE` só vê o A; gravar para o B é recusado.

**HTTP de verdade (`php -S`):**

- **Cookie** — `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` e sem `Domain`; `Cache-Control: no-store`.
- **Ciclo da sessão** — o login emite um ID novo e o ID de antes não dá acesso; um ID inventado pelo cliente é trocado pelo servidor; depois do logout, o ID deixa de valer.

## OWASP ASVS 4.0.3 — nível 1 (revisão do que cabe a este spike)

| Requisito | Situação |
| :--- | :--- |
| 2.1.1 / 2.1.2 senha de 12 a 128 caracteres | ✅ `PasswordPolicy` |
| 2.1.3–2.1.5 espaços e Unicode, sem truncar | ✅ (com bcrypt de reserva, o limite real é 72 bytes: preferir Argon2id) |
| 2.1.7 senhas vazadas/comuns | ⚠️ lista curta embutida; no produto, a API de faixa do Have I Been Pwned (k-anonimato, gratuita) |
| 2.1.9 sem regras de composição | ✅ |
| 2.2.1 proteção contra força bruta | ✅ `LoginThrottle` (conta+IP e IP) |
| 2.4.1 hash de senha resistente | ✅ Argon2id (19 MiB, t=2) |
| 2.5.x recuperação de senha | ⏭️ próxima demanda (precisa do SMTP) |
| 3.2.1 novo token de sessão na autenticação | ✅ `session_regenerate_id(true)` |
| 3.2.2 / 3.2.3 token com ≥ 64 bits, só em cookie | ✅ `sid_length` 48 × 6 bits, `use_only_cookies`, `use_trans_sid=0` |
| 3.3.1 logout invalida a sessão no servidor | ✅ |
| 3.3.2 reautenticação periódica | ✅ 12 h absolutas |
| 3.4.1–3.4.5 cookie Secure, HttpOnly, SameSite, `__Host-`, Path | ✅ |
| 4.1.x / 4.2.1 controle de acesso no servidor, sem IDOR | ✅ tenant e aluno só da sessão; ID de outro cliente não devolve nada |
| 4.2.2 CSRF | ✅ token sincronizador + SameSite=Lax + só JSON |
| 5.1.x validação de entrada | ✅ e-mail, nome sem caracteres de controle, convite, quest e XP |
| 7.1.1 sem segredos/senhas nos logs | ✅ só a classe da exceção; tabela de tentativas só com hashes |
| 8.3.x dados pessoais mínimos | ✅ LGPD: e-mail, nome de exibição, progresso e aceite dos termos |

## Achados

1. **Superusuário ignora o RLS.** Mesmo com `FORCE ROW LEVEL SECURITY`, um superusuário do PostgreSQL vê tudo. O teste só prova o RLS porque troca para um papel comum (`SET ROLE`), e é assim que a aplicação precisa conectar no produto.
2. **Placeholder em comentário não é um atalho.** A primeira versão do INSERT "passava" pela trava do repositório citando o filtro num comentário do SQL. Com prepares nativos, o PDO também lê placeholders ali, e a consulta quebraria. A trava passou a reconhecer o INSERT de verdade: a coluna `tenant_id` recebendo `:tenant_id`.
3. **Cadastro revela que o e-mail existe.** Responder "e-mail já cadastrado" ajuda o aluno, mas também quem quer descobrir contas. O limite de 10 cadastros por IP a cada 15 min reduz o uso disso em massa. A alternativa sem vazamento exige confirmar por e-mail, o que fica para quando houver SMTP.
4. **IP atrás do Cloudflare.** O spike usa o `REMOTE_ADDR`. Atrás do Cloudflare, esse é o IP do Cloudflare: no produto, o limite precisa do `CF-Connecting-IP`, aceito só de quem é de fato o Cloudflare. Sem isso, o limite por IP trancaria todo mundo junto.
5. **`__Host-` exige HTTPS.** No navegador, o cookie só vale em HTTPS ou em `http://localhost`. Em desenvolvimento por outro endereço da rede local, o login não pega.

## Demo

Sem demo ao vivo, de propósito: um cadastro público de verdade no servidor do labs seria alvo de abuso. Os endpoints em `http/api/` respondem **403** no servidor (o deploy do labs confere), e a prova é a execução do `verify`, publicada na página deste item.

## Como testar localmente

Precisa de **PHP 8.2** com `pdo_mysql` e `pdo_pgsql` e de Docker para os bancos (os comandos estão em "Como rodar", na página do item). Sem banco configurado, o `verify` roda só as regras puras.

```bash
php scripts/verify.php
```
