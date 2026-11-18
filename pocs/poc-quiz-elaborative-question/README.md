# PoC: a resposta e o porquê (questão em 2 etapas)

## Problema

Numa plataforma de ensino com cidades 3D, o quiz da sala já é corrigido no servidor (a PoC [`poc-quiz-runner-server-graded`](../poc-quiz-runner-server-graded)). Uma questão de múltipla escolha, porém, mede se o aluno **reconhece** a resposta, não se ele **entende a causa**. Quem decorou acerta do mesmo jeito.

A **interrogação elaborativa** pede ao aluno que explique por que um fato é verdadeiro. É uma técnica de estudo de utilidade moderada na revisão de Dunlosky et al. (2013). No quiz, ela vira uma questão em 2 etapas:
1. o aluno responde;
2. em seguida, ele escolhe por que essa é a resposta certa, entre alternativas.

Para isso, a questão nova precisa:
- **Entrar sem mexer nos outros formatos:** a correção é uma estratégia por formato (Strategy). A questão nova é uma estratégia a mais.
- **Não vazar nada no meio da tentativa:** a regra da US58 corrige só no envio. O porquê não pode depender de uma resposta do servidor sobre a 1ª etapa.
- **Dar meio ponto, se o autor quiser,** sem erro de arredondamento na nota de corte.
- **Funcionar só com o teclado**, como o resto do quiz.
- **Custo zero:** só o PHP e o MySQL da hospedagem compartilhada (MySQL 5.7).

## Decisões (do Pablo, 2026-11-13 e 2026-11-18)

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Onde entra | Um **formato novo** do quiz (`twostep`), corrigido por uma estratégia nova (`TwoStepGrader`). | Os outros 5 formatos e o serviço ficam iguais (aberto para extensão, fechado para modificação). |
| A 1ª etapa | **Escolha única ou verdadeiro ou falso** (decisão de 2026-11-18). | A correção da resposta reaproveita as duas estratégias que já existem. O porquê fica ligado a uma resposta só, e o editor continua simples. |
| Quando o porquê aparece | **Na mesma tela**, assim que a resposta tem uma escolha, sem perguntar ao servidor (decisão de 2026-11-18). | A correção das duas etapas vem só no envio, como nos outros formatos: nada vaza no meio da tentativa. |
| A nota | A questão vale **1 só com as duas etapas certas**. O autor pode dar **meio ponto** para quem acerta só a resposta (decisão de 2026-11-13). | O porquê certo com a resposta errada vale 0: as alternativas do porquê explicam a resposta certa. |
| A conta | Os pontos são somados em **meios pontos inteiros** (4,5 ➔ 9), nos dois lados e no banco. | A nota de corte é exata: 3,5 de 5 é 70% e passa em 70%, sem ponto flutuante. |
| A devolutiva | Certo, **meio ponto** ou errado; em cada etapa, se acertou; e a **explicação do porquê**. **Sem** a resposta certa nem o porquê certo. | É o Gherkin da issue: com o porquê errado, a explicação aparece. Como na US58, o banco de questões não é entregue para a próxima tentativa. |
| O meio ponto | Vai junto com a questão (`halfCredit`). | Não é gabarito: o aluno sabe quanto a questão vale antes de responder. |

## Solução

```text
src/quiz.ts                 o formato novo (TwoStepView), o crédito das 2 etapas e a nota com meio ponto, em TypeScript puro
src/quiz.test.ts            os casos de cases/ e o que a tela decide sozinha, no Node 24
cases/                      os casos que os dois lados rodam: a nota, o crédito das 2 etapas (013 a 016) e o meio ponto (017 a 019)
php/Quiz/AttemptRules.php   a mesma nota e o mesmo crédito em PHP (meios pontos inteiros)
php/Quiz/Graders.php        a correção por formato; TwoStepGrader é a estratégia nova (PartialGrader: crédito e etapas)
php/Quiz/QuizService.php    abrir (a 1ª etapa e os porquês embaralhados) e enviar (o crédito, as etapas e a explicação)
php/Quiz/QuizStore.php      o repositório (PDO, só SQL do MySQL 5.7), com os pontos em meios pontos
public/quiz.php             a API, no formato {status, data} do produto, com CSRF
public/app.v1.js            a janela: o porquê aparece logo abaixo da resposta, e a devolutiva mostra cada etapa
public/quiz-view.v1.js      o que a tela decide sozinha: quando mostrar o porquê, o que está respondido, os pontos com vírgula
migrations/mysql/           as tabelas poc_eq_* e o quiz de exemplo (10 questões, 7 em 2 etapas, 3 delas com meio ponto)
scripts/verify.php          os casos, a correção, o serviço no MySQL e a API de verdade
scripts/e2e.mjs             as 2 etapas no Chrome, só pelo teclado, e a janela num celular
scripts/e2e-router.php      o roteador do php -S do e2e (o gabarito só com QUIZ_E2E=1, nunca no ar)
```

As tabelas são as da PoC da US58, com o prefixo `poc_eq_`: as duas demos ficam no ar no mesmo banco. A única mudança é `half_points` no lugar de `correct`.

### Os cenários

| Cenário | O que acontece |
| :--- | :--- |
| Resposta certa, porquê errado (o Gherkin da issue) | Sem o meio ponto, a questão vale 0, a devolutiva diz "Resposta: certa · Porquê: errado" e mostra a explicação do porquê. |
| Meio ponto do autor | A resposta certa com o porquê errado vale 0,5 ("½ Meio ponto"). Com o porquê errado numa questão com meio ponto e noutra sem, a prova dá 3,5 de 5: 70%, aprovada no limite da nota de corte. |
| Porquê certo, resposta errada | Vale 0, mesmo com o meio ponto. |
| O porquê na mesma tela | O porquê começa escondido. Com Espaço numa resposta, ele aparece logo abaixo, o leitor de tela ouve "Agora escolha o porquê", e o Tab leva até ele. O "Enviar" só liga com as duas etapas respondidas. |
| Nada vaza | A abertura não traz o gabarito, o porquê certo, a justificativa nem a semente. A devolutiva não mostra o texto de nenhum porquê. |

## Como testar

```bash
yarn install --frozen-lockfile
node --no-warnings --test src/quiz.test.ts   # a nota, o crédito das 2 etapas e as tentativas em TypeScript (Node 24)
php scripts/verify.php                       # os mesmos casos, o sorteio e a correção, sem banco

# com o MySQL 5.7 (o da hospedagem) ou o 8.4 (o do CI): o serviço, a API e o e2e no Chrome
docker run -d --rm --name poc-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
yarn verify
docker stop poc-mysql
```

O `verify.php` apaga e recria as tabelas `poc_eq_*` do banco informado: use um MySQL de teste.

## Resultado

- **TypeScript:** 27 testes, com os 19 casos de `cases/`.
- **PHP:** 69 verificações no MySQL 5.7.44 e no 8.4.13 (38 delas sem banco).
- **e2e:** no Chrome headless, só pelo teclado, 20 verificações:
  - o porquê aparece depois da resposta;
  - a prova sai com 3,5 de 5 (aprovada com 70%);
  - a devolutiva mostra cada etapa, o meio ponto e a explicação;
  - a reprovação mostra a espera;
  - a janela cabe num celular de 390 px;
  - não há erro na página nem pedido a outra origem.

## No produto (Etapa 2 da US59)

- O formato `twostep` entra no `QuizFormat` (a validação do editor) e no `QuizGraders` do servidor, com a regra da 1ª etapa (escolha única ou verdadeiro ou falso) e os textos nos dois idiomas.
- A nota com meio ponto passa a somar meios pontos no `QuizService` e na tentativa (`quiz_attempts`), numa migration nova da instituição.
- A janela do quiz (`QuizScreen`) mostra o porquê logo abaixo da resposta, pelo teclado, e a devolutiva mostra cada etapa.
- O editor de questões (aba "Quizzes") ganha o formato, com o meio ponto.
- O "Dev a PM", vitrine da plataforma, ganha questões em 2 etapas no quiz do RICE e no treino, sem versão nova do curso: as questões ficam fora do documento, então ninguém tem o progresso zerado (decisão de 2026-11-18).
