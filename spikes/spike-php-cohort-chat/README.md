# Spike: chat da turma com moderação, por polling, sem serviço externo

## Problema

Numa plataforma de ensino com cidades 3D, o aluno quer conversar com os colegas da turma: com todos, com quem está perto dele na cidade ou em particular com um colega. Ele quer isso para tirar dúvidas e estudar junto.

Restrições:
- **Custo zero:** a hospedagem compartilhada já paga (PHP 8.2 e MySQL), sem WebSocket e sem serviço de tempo real. A presença dos colegas já roda por polling curto ([`spike-realtime-presence-zero-cost`](../spike-realtime-presence-zero-cost)).
- **Alunos menores:** o chat precisa de moderação e de uma regra clara de quanto tempo as mensagens ficam guardadas (LGPD).
- **Privado de verdade:** num serviço de broadcast, a mensagem "privada" chega a todos os clientes, que só a escondem. Aqui, o servidor entrega a mensagem só aos dois.
- **Remetente confiável:** quem mandou vem da sessão, nunca do corpo do pedido.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Transporte | **Polling curto** no mesmo PHP, como a presença. Na demo, a cada 1,5 s; no produto, a mensagem pode viajar na batida da presença (1 s andando, 5 s parado). | Nenhum processo preso por aluno e nenhuma cota de mensagens. |
| Canais | **Turma** (a turma inteira, em qualquer cidade do curso), **perto** (quem está no mesmo lugar, a até **5 m**) e **privado** (um colega da mesma turma). Sem chat na sede. | Sempre dentro da turma do aluno naquele curso. |
| "Perto" | O servidor decide **no envio**, pela posição de cada um (a da presença), quem está a até 5 m, e grava uma entrega para cada um. Quem está longe nunca recebe a mensagem. | O cliente não escolhe quem recebe. A regra dos 3 m e dos 20 m vale no servidor. |
| Privado | Só entre dois alunos da mesma turma, entregue só aos dois. **Começa desligado** em cada curso; o master liga. | Com alunos menores, a instituição decide curso a curso. |
| Remetente | Vem só da sessão. `from`, `tenant` e `cohort` no pedido não valem nada. | Ninguém se passa por outro. |
| Bloquear | Quem bloqueia deixa de ver tudo de quem foi bloqueado, em todos os canais, inclusive as mensagens antigas; ao desbloquear, elas voltam. O bloqueado não fica sabendo. | O Gherkin "Bloquear". |
| Denunciar | O aluno denuncia uma mensagem que chegou a ele (não a que não chegou). A denúncia cai na fila do master da instituição, com a mensagem e quem mandou; o master a resolve. | O master de outra instituição não vê a fila. |
| Ligar e desligar | O master liga e desliga o chat do curso e, em separado, o privado. Com o chat desligado, ninguém manda nem recebe. | A instituição controla o recurso. |
| Filtro de palavras | Uma lista da instituição (até 100 palavras). A mensagem com uma delas, inteira, é recusada, sem diferença de maiúsculas e acentos ("BÓBO" cai; "bobolho" passa). | Contém o óbvio; a denúncia cobre o resto. |
| Limite | **10 mensagens por minuto** por pessoa (429). | Contém abuso e o custo na hospedagem. |
| Guarda (LGPD) | Cada mensagem sai depois de **90 dias**. A denunciada fica enquanto a denúncia está aberta e por **1 ano** depois de resolvida; depois, sai junto com a denúncia. | O mínimo para apurar uma denúncia, com a minimização da LGPD. |
| Demo em várias abas | As janelas anônimas do navegador dividem os mesmos cookies, então a sessão da demo guarda a lista de quem entrou por ela, e cada aba diz qual é a dela (`as`). O servidor só aceita um id dessa lista. | Três pessoas no mesmo navegador, sem ninguém falar por quem entrou por outra sessão. No produto, cada aba é a conta logada. |
| Entrega sem perda | A batida só entrega mensagens com pelo menos 250 ms. O cursor é o id da última entregue. | Uma gravação no mesmo instante da leitura não se perde (a lição do cursor da presença). |

## Solução

```text
src/Chat/ChatRules.php    as regras puras: os canais, o texto, o filtro de palavras, os 5 m e os prazos
src/Chat/ChatStore.php    as tabelas: quem vê cada mensagem (no servidor), o "perto" no envio, bloqueios, denúncias e a guarda
src/Chat/ChatService.php  poll, send, block, report e, para o master, settings, reports e resolve
src/Chat/Member.php       quem pede, vindo só da sessão (a pessoa, a instituição, a turma e o papel)
src/Chat/DemoSession.php  a entrada da demo, no lugar do login do produto (várias pessoas por sessão, uma por aba)
src/bootstrap.php         a conexão (arquivo de ambiente fora do webroot) e a sessão
public/chat.php           POST: todas as ações do chat
public/session.php        POST: entrar numa instituição e turma fictícias, como aluno ou master
public/index.html         a demo: o mapa (clique para andar), os três canais e a moderação do master
scripts/verify.php        as regras, o chat no MySQL e os endpoints de verdade
migrations/mysql/         as tabelas spike_chat_*
```

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Conversa por proximidade | Ana manda "perto": Bia, a 3 m, recebe; Caio, a 20 m, não recebe; Davi, ao lado mas de outra turma, também não. |
| Privado é privado | Com o privado ligado pelo master, Ana manda para Bia: só Bia recebe. Caio, na mesma cidade, não recebe nada, porque o servidor nunca manda a mensagem a ele. O master também não vê. |
| Bloquear | Bia bloqueia Ana: as mensagens de Ana (da turma e do privado, novas e antigas) somem para Bia. Caio continua vendo. |

## Como testar

```bash
yarn verify   # as regras, sem banco

# com o MySQL 5.7 (o da hospedagem) e o 8.4 (o do CI)
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
yarn verify   # PHP 8.2 com pdo_mysql e curl
docker stop spike-mysql
```

## Resultado

- **32 verificações verdes no MySQL 5.7.44 e no 8.4.13:**
  - 4 das regras, sem banco;
  - 22 do chat no banco (os três cenários, o isolamento, a moderação e a entrega);
  - 3 da guarda e do custo;
  - 3 dos endpoints de verdade (inclusive duas abas na mesma sessão).
- **Custo:** com a turma cheia (48) no mesmo lugar, a batida com 20 mensagens novas leva cerca de 6 ms e tem 5,3 KB; sem nada novo, cerca de 8 ms e 3,2 KB, quase tudo a lista de quem está no lugar. No produto, essa lista já vem da presença.
- **Nenhuma dependência nova:** PHP e MySQL da hospedagem.

## Limites e próximos passos

- **No produto (US42):**
  - as tabelas ficam no banco de cada instituição (US47), sem a coluna de instituição;
  - a turma vem da matrícula, e a posição, da presença (US41);
  - a mensagem viaja na batida da presença, sem pedido a mais;
  - a guarda roda no Cron diário;
  - a moderação fica no painel do admin.
- **Os masters:** na demo, o master entra numa turma e fala com ela (com o selo de equipe). Mandar um aviso para todas as turmas fica para o produto.
- **Fora daqui:** anexos, emojis personalizados, edição de mensagem e o "lida por".
- **Limpeza da demo:** as pessoas e as mensagens fictícias somem em 1 dia.
