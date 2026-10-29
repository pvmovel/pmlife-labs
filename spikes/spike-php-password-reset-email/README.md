# Spike: recuperar a senha com um código por e-mail, sem framework

## Problema

Quem esquece a senha precisa voltar à conta sem depender do suporte. As restrições são as mesmas do spike de contas (`spike-php-session-auth-multitenant`):

- hospedagem compartilhada com **PHP 8.2 e MySQL 5.7**, sem Composer e **sem custo** (nada de serviço de e-mail transacional pago);
- a conta é **única por e-mail** e pode ter vínculos com mais de uma instituição: a senha é da conta, não do vínculo;
- alunos podem ser **menores de idade** (LGPD): o e-mail leva o mínimo.

A recuperação não pode virar a porta dos fundos da conta:
- não pode revelar quem tem conta;
- não pode aceitar força bruta no código;
- não pode deixar abertas as sessões de quem tinha a senha antiga.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Formato | **Código de 8 dígitos**, digitado na mesma tela do pedido | Sem link no e-mail: o código não fica no histórico do navegador nem em logs de acesso. É fácil de digitar no celular. |
| Validade | **15 min**, **uso único**, **5 tentativas** por código; pedir outro invalida o anterior | Com 3 códigos por hora, um atacante tem 15 chances em 100 milhões por hora. |
| Guarda | Só o **HMAC-SHA256** do código (segredo do env + conta) | Quem lê a tabela não descobre o código. O mesmo código de outra conta não confere. |
| Resposta ao pedido | **Sempre `202`**, igual com ou sem conta, e o limite também vale para e-mail sem conta | Ninguém descobre quem tem conta, nem pela resposta, nem pelo `429`. |
| Envio | **Depois da resposta** | O SMTP leva centenas de milissegundos: enviar antes revelaria pelo tempo quem tem conta. |
| Senha nova | A política da US30 (12 a 128 caracteres, sem senhas comuns, Argon2id), conferida **antes** do código | Uma senha fraca ou uma confirmação diferente não gastam tentativa. |
| Outras sessões | **Encerradas** pela versão das credenciais da conta | A sessão guarda a versão do login. A troca sobe a versão, e a sessão antiga cai na próxima requisição, sem listar arquivos de sessão. |
| Depois da troca | Volta ao login com a senha nova | O login segue igual, inclusive a escolha da instituição quando a conta tem mais de uma. |

## Solução

```text
migrations/
├── mysql/001..003   users (com credentials_version) · auth_rate_limit · password_resets
└── pgsql/001..003   o mesmo SQL em PostgreSQL
src/
├── Reset/
│   ├── PasswordResetService.php  pedido (resposta igual, envio para depois) e troca (senha antes do código)
│   ├── ResetCode.php             8 dígitos (random_int), normalização, "1234 5678", HMAC
│   ├── ResetThrottle.php         3 pedidos/conta/h, 10/IP/15 min, 20 trocas erradas/IP/15 min
│   ├── PdoResetStore.php         tentativa atômica, troca e apagamento numa transação, limpeza do Cron
│   └── SessionCredentials.php    a sessão antiga cai quando a versão das credenciais muda
├── Mail/
│   ├── Mailer.php · MemoryMailer.php   o Port de envio e o duplo de teste
│   ├── SmtpMailer.php            cliente SMTP sem Composer: TLS implícito verificado, AUTH LOGIN, UTF-8 em base64
│   ├── ResetMail.php             o e-mail no idioma da tela
│   └── locales/pt-BR.json · en-US.json
├── Http/
│   ├── ResetApi.php              as duas rotas no envelope {status, data|error}
│   └── Responder.php             responde, fecha a conexão e só então envia o e-mail
└── Auth/                         PasswordPolicy e contadores (os mesmos da US30)
http/api/password-reset.php       controller fino (no labs responde 403)
```

| Técnica | Por quê |
| :--- | :--- |
| **Tentativa atômica** | `UPDATE ... SET attempts = attempts + 1 WHERE attempts < 5 AND expires_at > agora`: dois pedidos ao mesmo tempo nunca passam de 5 tentativas. |
| **Uso único atômico** | `DELETE ... WHERE user_id = ? AND code_hash = ?` e a troca da senha numa transação: com dois pedidos certos ao mesmo tempo, só um troca. |
| **Sem upsert** | Apagar e inserir na mesma transação: o mesmo SQL roda no MySQL e no PostgreSQL. |
| **TLS sempre verificado** | `verify_peer` e o nome do host ficam ligados. O servidor de teste usa um certificado próprio, informado como CA. Sem TLS, só no próprio computador: para qualquer outro host, a senha do SMTP nunca sai em claro. |
| **Sem injeção de cabeçalho** | Quebra de linha no destinatário ou no assunto é recusada. O corpo vai em base64, então nenhuma linha começa com `.` e o fim do `DATA` não pode ser forjado. |
| **Fechar antes de enviar** | `fastcgi_finish_request()` (PHP-FPM) ou `litespeed_finish_request()` (LiteSpeed). Sem nenhum dos dois, o envio acontece antes do fim da resposta, e isso vai para o log. |
| **Falha de envio silenciosa** | O aluno recebe o mesmo `202`. O log registra a etapa e o código SMTP, sem a senha do SMTP nem o e-mail do aluno. |

### Como enviar o e-mail a custo zero (para o ADR)

São duas opções sem custo numa hospedagem compartilhada. As duas usam o mesmo Port `Mailer`, e trocar uma pela outra é questão de configuração.

1. **SMTP autenticado da caixa de e-mail do domínio** (porta 465, TLS implícito): é o que este spike implementa e prova.
   - O provedor de e-mail assina com DKIM e cuida da reputação.
   - A credencial fica no env do ambiente, fora do webroot.
2. **Envio pelo próprio servidor** (`mail()` ou o SMTP local da hospedagem):
   - não precisa de credencial;
   - a entrega depende do SPF e do DKIM do servidor e da reputação do IP compartilhado.

**Recomendação:** a opção 1. O critério final é medido no ambiente de homologação:
- no Gmail e no Outlook, o e-mail chega na caixa de entrada (fora do spam);
- em "Mostrar original", SPF, DKIM e DMARC aparecem como `PASS`;
- o limite de envios por hora do plano comporta 3 pedidos por conta.

Isso não dá para provar num CI.

## O que o `verify` prova (91 checks)

**Sem banco:**
- **Código:** 8 dígitos, sem repetição, aceito com espaço ou hífen, e HMAC por conta e por segredo.
- **Limites:** 3 pedidos por conta (mesmo de outro IP e com maiúsculas no e-mail), 10 por IP e 20 trocas erradas por IP, sem o truque da virada de janela.
- **E-mail:** o idioma (pt-BR e en-US, com o pt-BR quando o idioma é desconhecido), sem o nome nem as instituições da conta, e a injeção de cabeçalho recusada.
- **SMTP:** sem TLS, um host remoto é recusado; o assunto em UTF-8 e o corpo em base64.

**Em cada banco (MySQL 5.7 e PostgreSQL 16 reais; MySQL 8.4 no CI):**
- **Gherkin, trocar a senha:**
  - o e-mail só sai depois da resposta, e o banco guarda só o HMAC;
  - o código com espaço troca a senha, gravada com Argon2id, e a senha antiga deixa de valer;
  - o código é apagado e não serve de novo.
- **Gherkin, encerrar as outras sessões:** a sessão de antes da troca cai, e um login novo vale.
- **Gherkin, não revelar quem tem conta:** status, corpo e cabeçalhos iguais para quem não tem conta, sem e-mail enviado, e o mesmo erro na troca.
- **Gherkin, código vencido, usado ou errado demais:**
  - um código novo invalida o anterior;
  - o código vence aos 15 min, e a senha antiga continua valendo;
  - depois de 5 erros, nem o código certo serve.
- **Gherkin, confirmação diferente ou senha fraca:** é recusada sem gastar tentativa, e o mesmo código ainda funciona.
- **Pedidos em paralelo:** nunca mais de 5 tentativas, e só um entre dois pedidos certos troca a senha.
- **Gherkin, pedidos em excesso:** o 4º pedido recebe `429` com `Retry-After`, sem e-mail; para e-mail sem conta também; e 20 trocas erradas por IP também dão `429`.
- **LGPD e limpeza:** a tabela de limites só tem hashes, e o Cron apaga os códigos vencidos.

**SMTP de verdade (Mailpit, servidor de teste em Docker):**
- **Ponta a ponta:** o e-mail chega com o assunto acentuado, e o código lido da mensagem recebida troca a senha. O inglês também sai quando pedido.
- **TLS implícito:** com o certificado verificado, o e-mail chega. Um certificado de CA não confiável é recusado, e um servidor sem TLS, quando o TLS é exigido, falha antes do AUTH.
- **Servidor fora do ar:** a resposta continua `202`, e o log não tem a senha do SMTP nem o e-mail do aluno.

## Para a Etapa 2 (PMLife)

- **Endpoints:** `POST /api/auth/password-reset/request` e `.../confirm`, com o CSRF e o "só JSON" do login (`JsonApi::postInput`) e o IP pelas faixas do Cloudflare (US30).
- **Sessão:** a versão das credenciais entra na sessão no login e é conferida em `AuthService::current()`. A troca também zera os erros de login da conta.
- **Banco:** migration `006` com `password_resets` e `users.credentials_version`, e a limpeza dos códigos vencidos no Cron que já existe.
- **No servidor:** conferir qual função fecha a resposta (`fastcgi_finish_request` ou `litespeed_finish_request`).
- **Front:** os dois passos dentro da janela de login, com i18n e o aviso "Senha alterada. Entre com a senha nova."
