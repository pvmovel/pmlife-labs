# Spike: presença multiplayer por polling, sem serviço externo

## Problema

Numa plataforma de ensino com cidades 3D, o aluno quer ver os colegas da **mesma turma** andando na cidade do curso, para sentir que estuda numa comunidade.

A infraestrutura é uma revenda de hospedagem compartilhada já paga, sem custo novo:
- **Sem WebSocket:** o PHP não mantém processo longo.
- **Sem long polling nem SSE:** cada um prende um processo por aluno, e a conta tem **25 processos** e **25% de CPU** para produção, homolog e o labs juntos.
- **Sem serviço externo de tempo real:** os planos grátis têm cota de mensagens. Com posição a 10 Hz, 10 alunos numa sala gastam 2 milhões de mensagens do mês em menos de uma hora, e o plano pode virar pago.

A sala precisa ser decidida no servidor. Um aluno não pode entrar na turma de outra instituição mandando outro número no pedido.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Transporte | **Polling curto**: cada aba faz um POST, o PHP grava a posição e responde a sala, e o processo termina | Um processo vive alguns milissegundos por batida. O custo é medido em CPU, não em processos presos. |
| Ritmo | **Adaptativo:** a cada **1 s** enquanto o avatar anda, a cada **5 s** parado. Com a aba escondida, a batida para; ao voltar, bate na hora. | Parado, o aluno quase não custa. O 1 s é suavizado no cliente pela interpolação. |
| Resposta | Os **ids** de todos na sala e os dados **só de quem andou** depois do cursor do cliente. O cursor é a hora do banco, não a do aparelho, com uma **folga de 250 ms**: quem andou logo antes dele volta. | Numa sala de 12, a resposta cai de 752 para 117 bytes quando todos estão parados. |
| Armazenamento | **InnoDB, uma linha por aluno**, com upsert a cada batida e um índice por (instituição, cidade, turma, visto em) | Sobrevive a um restart e é o que a hospedagem garante. No produto, a tabela fica no banco de cada instituição. |
| Saída da sala | Quem não bate há **15 s** saiu (três batidas paradas perdidas). Ao fechar a aba, um `sendBeacon` tira o aluno na hora. | Uma rede caída ou um notebook fechado não deixam um fantasma na sala. |
| Isolamento | A instituição, a cidade e a turma vêm **só da sessão** do servidor. O corpo do pedido leva a posição e o cursor, mais nada. | Mandar outra instituição ou outra turma no pedido não muda a sala. No produto, a sessão é o login, e a turma é a da matrícula. |
| Equipe | O master entra **invisível**: vê a turma, e a turma não o vê. Com "Aparecer", surge com o selo de equipe. | A equipe acompanha a turma sem interferir. Só a equipe pode mudar isso (o aluno recebe 403). |
| Sem serviço, sem quebra | Se a batida falha, o aluno continua sozinho, com um aviso discreto, e tenta de novo cada vez mais devagar (5 s, 10 s, até 30 s) | A conta ocupada ou a rede caída nunca travam o jogo. |
| Sessão | A sessão é fechada logo depois da leitura (`session_write_close`) | O arquivo de sessão não trava, e as batidas da mesma pessoa não fazem fila. |

## Solução

```text
src/Presence/Seat.php            quem pede e em que sala (vem só da sessão)
src/Presence/PresenceStore.php   a tabela: upsert da batida, a sala com só o que mudou, a saída e a limpeza
src/Presence/PresenceService.php a batida: valida a posição e o cursor, grava, devolve a sala e o ritmo
src/Presence/DemoSession.php     a entrada da demo, no lugar do login e da matrícula do produto
src/bootstrap.php                a conexão (arquivo de ambiente fora do webroot) e a sessão
public/presence.php              POST da batida
public/session.php               POST de entrar, aparecer ou sumir (só a equipe) e sair
public/index.html                a demo: o mapa visto de cima, as setas, a interpolação e o modo individual
scripts/verify.php               as regras contra o MySQL, os endpoints de verdade e as medições
scripts/load.php                 o teste de carga com robôs que andam e param como alunos
migrations/mysql/                a tabela spike_presence
```

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Ver os colegas na mesma cidade | Duas abas da Aurora, turma A: a segunda recebe a primeira na posição que ela mandou, e a demo a faz deslizar até lá em 1 s. |
| Isolamento | A aba da Boreal manda a instituição da Aurora no pedido e continua sozinha na sala dela. Na regra, a Ana (Aurora, turma A) vê a Bia e o Caio, e não vê o Davi (turma B) nem a Eva (Boreal). |
| Sem serviço, sem quebra | Com a batida falhando, a demo apaga os colegas, mostra "Modo individual" e tenta de novo mais devagar. O avatar continua andando. |

## Como testar

```bash
yarn verify   # só a validação da batida, sem banco

# com o MySQL 5.7 (o da hospedagem) e o 8.4 (o do CI)
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
php scripts/verify.php   # PHP 8.2 com pdo_mysql e curl
docker stop spike-mysql
```

**Carga contra a demo publicada.** São 12 robôs por 5 minutos, de madrugada, com o "Uso de recursos" do painel da hospedagem aberto. O script roda no PHP 7.4 ou mais novo, só com o curl:

```bash
php scripts/load.php <url-da-pasta-public> 12 300
```

## Resultado

- **22 verificações** no MySQL 5.7.44 e no 8.4, todas verdes, e 2 sem banco (a validação da batida).
- **Batida** (gravar e ler a sala, dentro do PHP, com 20 salas no banco): de 3 a 8 ms de mediana com salas de 12, 24 e 48. O tempo **não cresce com a sala**, e quase todo ele é a gravação em disco do MySQL.
- **Pedido inteiro pelo HTTP** (o PHP compila o script, abre a sessão e a conexão, sem opcache): cerca de **1,1 ms de CPU do PHP** por batida, e 6 ms de resposta na máquina local.
- **Resposta numa sala de 12:** 752 bytes com os 11 colegas andando e **117 bytes** com todos parados.
- **Capacidade estimada.** A conta tem 25% de um núcleo. Reservando metade para o resto do site, sobram 125 ms de CPU por segundo para a presença. Com esse orçamento:

  | Tempo andando | Batidas por segundo, por aluno | Alunos online |
  | :--- | :--- | :--- |
  | 30% | 0,44 | ~250 |
  | 50% | 0,60 | ~185 |
  | 100% | 1,00 | ~110 |

  Em média, menos de 1 processo PHP fica ocupado. O processador da hospedagem é mais lento e compartilhado: o número de lá sai do `load.php`.
- **Teste de carga local** (12 robôs por 20 s, servidor embutido do PHP): 0,38 batida por segundo por robô, mediana de 6 ms, 463 bytes por batida, os 11 colegas vistos ao mesmo tempo e só respostas 200.

## Limites e próximos passos

- **No produto (US41):**
  - a tabela fica no banco de cada instituição, sem a coluna de instituição;
  - a sessão é o login, e a turma é a da matrícula, conferida contra o curso;
  - a sede não tem presença, só a cidade do curso e as fases;
  - os avatares remotos entram no 3D com a mesma interpolação e um limite de avatares desenhados.
- **Corrida do cursor (achado do CI, numa máquina rápida):** um colega que anda no mesmo milissegundo da leitura, ou cuja gravação termina logo depois dela, ficava com o `moved_at` igual ou um pouco antes do cursor, e a mudança se perdia. Se ele parasse ali, ficava na posição velha na tela dos outros. A folga de 250 ms no cursor reenvia quem andou logo antes; a mesma posição de novo não muda nada na tela.
- **Limpeza:** a demo apaga as linhas de mais de 1 hora na entrada. No produto, isso vai para o Cron.
- **Medida:** o CPU medido é o do processo PHP. O MySQL da hospedagem é compartilhado e não entra nos 25% da conta, mas a gravação de cada batida pesa nele. O teste de carga na hospedagem mostra os dois juntos.
